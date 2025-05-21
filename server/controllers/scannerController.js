import Resident from "../models/Resident.js";
import EntryLog from '../models/EntryLog.js';
import Block from '../models/Block.js';
import Visitor from "../models/Visitor.js";
import VisitRequest from "../models/VisitRequest.js";

const verifyQR = async (req, res) => {
  const { qrData } = req.body;

  if (!qrData) {
    return res.status(400).json({ success: false, error: 'No QR data provided' });
  }

  const prefix = qrData.split('-')[0];

  try {
    if (prefix === 'RES') {
      await verifyResident(qrData, res);  // Pass res to reuse logic
    } else if (prefix === 'VIS') {
      await verifyVisitor(qrData, res);
    } else if (prefix === 'REQ') {
      await verifyRequest(qrData, res);
    } else {
      return res.status(400).json({ success: false, error: 'Invalid QR code format' });
    }
  } catch (error) {
    console.error('QR verification error:', error);
    return res.status(500).json({ success: false, message: 'Server error verifying QR code' });
  }
};

const verifyResident = async (qrData, res) => {

  try {
    const resident = await Resident.findOne({ qrCodeData: qrData })
      .populate('userId', 'name email')
      .populate('apartment', 'apartment_name');

    if (!resident) {
      return res.status(404).json({ success: false, error: 'Resident not found' });
    }

    // Check if the resident is blocked
    const blockEntry = await Block.findOne({ resident: resident._id });
    const now = new Date();

    if (blockEntry && now >= blockEntry.fromDateTime && now <= blockEntry.toDateTime) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Blocked from ${blockEntry.fromDateTime.toLocaleString()} to ${blockEntry.toDateTime.toLocaleString()}`,
      });
    }

    // Determine next action (enter or leave)
    const lastLog = await EntryLog.findOne({ resident: resident._id }).sort({ timestamp: -1 });
    const nextAction = (!lastLog || lastLog.type === 'leave') ? 'enter' : 'leave';

    // Save log
    const newLog = new EntryLog({
      resident: resident._id,
      type: nextAction
    });

    await newLog.save();

    res.status(200).json({
      success: true,
      message: `Resident ${nextAction === 'enter' ? 'entered' : 'left'} successfully`,
      action: nextAction,
      resident
    });

  } catch (error) {
    console.error('QR verification error:', error);
    res.status(500).json({ success: false, message: 'Server error verifying QR code' });
  }
};

const verifyVisitor = async (qrData, res) => {
  try {
    const visitor = await Visitor.findOne({ qrCodeData: qrData })
      .populate({
        path: 'resident',
        populate: [
          { path: 'userId', select: 'name email' },
          { path: 'apartment', select: 'apartment_name' }
        ]
      });

    if (!visitor) {
      return res.status(404).json({ success: false, error: 'Visitor not found' });
    }

    // Check if the visitor is blocked
    const blockEntry = await Block.findOne({ visitor: visitor._id });
    const now = new Date();

    if (blockEntry && now >= blockEntry.fromDateTime && now <= blockEntry.toDateTime) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Blocked from ${blockEntry.fromDateTime.toLocaleString()} to ${blockEntry.toDateTime.toLocaleString()}`,
      });
    }

    // const now = new Date();

    // Convert time strings to today's Date objects
    const todayStr = now.toISOString().split('T')[0]; // e.g. "2025-04-23"
    const from = new Date(`${todayStr}T${visitor.visitTimeFrom}`);
    const to = new Date(`${todayStr}T${visitor.visitTimeTo}`);



    if (now < from || now > to) {
      return res.status(403).json({ success: false, error: 'Visitor access is not allowed at this time' });
    }

    // Determine next action
    const lastLog = await EntryLog.findOne({ visitor: visitor._id }).sort({ timestamp: -1 });
    const nextAction = (!lastLog || lastLog.type === 'leave') ? 'enter' : 'leave';

    // Save log
    const newLog = new EntryLog({ visitor: visitor._id, type: nextAction });
    await newLog.save();

    return res.status(200).json({
      success: true,
      message: `Visitor ${nextAction === 'enter' ? 'entered' : 'left'} successfully`,
      action: nextAction,
      role: 'visitor',
      visitor,
    });

  } catch (error) {
    console.error('Error verifying visitor QR code:', error);
    return res.status(500).json({ success: false, message: 'Server error verifying visitor QR code' });
  }
};

const verifyRequest = async (qrData, res) => {
  try {
    const request = await VisitRequest.findOne({ qrData })
      .populate('createdBy', 'name email')
      .populate({
        path: 'targetResident',
        populate: [
          { path: 'userId', select: 'name email' },
          { path: 'apartment', select: 'apartment_name' }
        ]
      });

    if (!request) {
      return res.status(404).json({ success: false, error: 'Visit request not found' });
    }

    if (request.status !== 'accepted') {
      return res.status(403).json({ success: false, error: 'Visit request is not accepted' });
    }

    const now = new Date();
    const from = new Date(`${request.visitDate}T${request.visitTimeFrom}`);
    const to = new Date(`${request.visitDate}T${request.visitTimeTo}`);

    if (now < from || now > to) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    // ✅ Determine next action based on last log (field name fixed here)
    const lastLog = await EntryLog.findOne({ visitRequest: request._id }).sort({ timestamp: -1 });
    const nextAction = (!lastLog || lastLog.type === 'leave') ? 'enter' : 'leave';

    // ✅ Save new log
    const newLog = new EntryLog({
      visitRequest: request._id,
      type: nextAction
    });

    await newLog.save();

    return res.status(200).json({
      success: true,
      message: `Visitor ${nextAction === 'enter' ? 'entered' : 'left'} successfully via VisitRequest`,
      action: nextAction,
      role: 'visitor',
      request
    });

  } catch (error) {
    console.error('Error verifying request QR code:', error);
    return res.status(500).json({ success: false, message: 'Server error verifying request QR code' });
  }
};

const getEntryLogs = async (req, res) => { 
  try {
    const entryLogs = await EntryLog.find()
      .populate({
        path: 'resident',
        populate: [
          { path: 'apartment' },
          { path: 'userId' }
        ]
      })
      .populate({
        path: 'visitor',
        populate: {
          path: 'resident',
          populate: {
            path: 'apartment'
          }
        }
      })
      .populate({
        path: 'visitRequest', // 👈 Add this to get visit request info
        populate: [
          { path: 'createdBy' },
          { path: 'targetResident', populate: { path: 'apartment' } }
        ]
      });

    return res.status(200).json({ success: true, entryLogs });
  } catch (error) {
    console.error("getEntryLogs error:", error);
    return res.status(500).json({ success: false, error: "get entryLogs server error" });
  }
};

  
  export {verifyQR,getEntryLogs}