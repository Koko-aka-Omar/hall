const { randomBytes, randomUUID } = require('node:crypto');

const courses = [{ id: 'ELEC210', code: 'ELEC 210', name: 'Electrical Engineering', room: 'C204', students: [
  ['20260001', 'Omar'], ['20260002', 'Ahmed'], ['20260003', 'Sara'],
  ['20260004', 'Khaled'], ['20260005', 'Maryam'], ['20260006', 'Ali']
].map(([id, name]) => ({ id, name })) }];

class AttendanceError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
class Attendance {
  constructor(now = Date.now) { this.now = now; this.session = null; }
  course(id) {
    const course = courses.find(c => c.id === id);
    if (!course) throw new AttendanceError('Class not found.', 404);
    return course;
  }
  start(courseId) {
    const course = this.course(courseId);
    if (this.session?.active) throw new AttendanceError('Stop the current session before starting another.', 409);
    this.session = { id: randomUUID(), courseId: course.id, room: course.room, createdAt: this.now(), active: true, records: [] };
    this.rotate();
    return this.view(true);
  }
  requireActive() {
    if (!this.session?.active) throw new AttendanceError('Attendance for this class is currently closed.', 409);
    return this.session;
  }
  rotate() {
    const session = this.requireActive();
    session.token = 'AT-' + randomBytes(12).toString('hex');
    session.tokenCreatedAt = this.now();
    session.expiresAt = session.tokenCreatedAt + 30000;
    return this.view(true);
  }
  stop() { const s = this.requireActive(); s.active = false; s.token = null; return this.view(true); }
  checkIn({ studentId, courseId, sessionId, token }, method = 'sound') {
    const s = this.requireActive();
    if (s.id !== sessionId || s.courseId !== courseId) throw new AttendanceError('This signal belongs to a different attendance session.');
    const student = this.course(courseId).students.find(x => x.id === studentId);
    if (!student) throw new AttendanceError('This student does not belong to the selected class.', 403);
    if (method === 'sound') {
      if (this.now() >= s.expiresAt) throw new AttendanceError('This attendance signal has expired. Wait for the lecturer to broadcast again.', 410);
      if (typeof token !== 'string' || token !== s.token) throw new AttendanceError('This signal is invalid or has been replaced. Wait for the lecturer to broadcast again.', 403);
    }
    if (s.records.some(x => x.studentId === studentId)) throw new AttendanceError('Your attendance has already been recorded.', 409);
    const record = { studentId, name: student.name, checkedInAt: this.now(), method };
    s.records.push(record);
    return { record, course: this.course(courseId).code, sessionId: s.id };
  }
  view(privateView = false) {
    const s = this.session;
    const session = s ? (privateView ? { ...s, records: [...s.records] } : {
      id: s.id, courseId: s.courseId, room: s.room, active: s.active, createdAt: s.createdAt
    }) : null;
    return { courses, session, serverTime: this.now() };
  }
}
module.exports = { Attendance, AttendanceError };
