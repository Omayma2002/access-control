import mongoose from 'mongoose';

const entryLogSchema = new mongoose.Schema({
  resident: { type: mongoose.Schema.Types.ObjectId, ref: 'Resident'},
  visitor: { type: mongoose.Schema.Types.ObjectId, ref: 'Visitor'},
  visitRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'VisitRequest'},
  type: { type: String, enum: ['enter', 'leave'], required: true },
  timestamp: { type: Date, default: Date.now }
  
});

const EntryLog = mongoose.model('EntryLog', entryLogSchema);
export default EntryLog;
