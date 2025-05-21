import Resident from '../models/Resident.js';
import VisitRequest from '../models/VisitRequest.js';
import User from '../models/User.js';
import QRCode from 'qrcode'
import fs from 'fs'
import path from 'path'
import { generateRequestId } from '../utils/generateRequestId.js';
import Notification from '../models/Notification.js';

export const getResidentsByApartmentId = async (req, res) => {
  try {
      const { id } = req.params;
      
      const residents = await Resident.find({ apartment: id })
        .populate('userId', 'name email phone')
        .exec();

      if (residents.length === 0) {
        console.log('❌ No residents found for this apartment');
        return res.status(404).json({ success: false, error: "No residents found for this apartment" });
      }

      // console.log('✅ Residents:', residents);
      return res.status(200).json({success: true, residents})
  } catch (error) {
     console.error('❌ Error:', error);
     return res.status(500).json({success: false,error: "getResidentsByApartmentId server error"})
  } 
}

export const addVisitRequest = async (req, res) => {
  try {
    const {
      targetResident,
      visitorName,
      visitorPhone,
      type,
      visitPurpose,
      customReason,
      visitTimeFrom,
      visitTimeTo,
      visitDate,
    } = req.body;

    console.log("customReason",customReason)

    const createdBy = req.user.id;

    const newRequest = new VisitRequest({
      createdBy,
      targetResident,
      visitorName,
      visitorPhone,
      type,
      visitPurpose,
      customReason, // This maps to the `Reason` field in schema
      visitTimeFrom,
      visitTimeTo,
      visitDate,
    });

    await newRequest.save();



    // ✅ Fetch the Resident to access userId
    const resident = await Resident.findById(targetResident);
    if (!resident) {
      return res.status(404).json({ success: false, message: 'Target resident not found.' });
    }

    // ✅ Now use resident.userId as the user ID for the notification
    const notification = new Notification({
      user: resident.userId, // Correct user ID of the resident
      visitRequest: newRequest._id,
    });

    await notification.save();

    res.status(201).json({ success: true, message: "Visit request created and notification sent." });

  } catch (err) {
    console.error("Error creating visit request:", err);
    res.status(500).json({ success: false, error: "Failed to create visit request." });
  }
};


export const getRequestsByresidentId = async (req, res) => {
  try {
    const userId = req.user._id;

    // Step 1: Get the resident document linked to the current user
    const resident = await Resident.findOne({ userId });

    if (!resident) {
      return res.status(404).json({ success: false, message: "Resident not found" });
    }

    // Step 2: Find visit requests where this resident is the target
    const requests = await VisitRequest.find({ targetResident: resident._id })
      .populate('createdBy', 'name email') // populate admin details if needed
      .populate('targetResident'); // optional

    res.status(200).json({
      success: true,
      requests
    });
  } catch (error) {
    console.error("Error fetching visit requests for resident:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch visit requests"
    });
  }
};


export const handleStatusChange = async (req, res) => {
  const { status } = req.body;
  const allowedStatuses = ['accepted', 'rejected'];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status value.' });
  }

  try {
    const request = await VisitRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    let updateData = { status };

    if (status === 'accepted') {
      const requestId = generateRequestId(); // Unique ID
      const qrData = requestId;
      const qrImagePath = `public/qrcodes/requests/${requestId}.png`;

      await QRCode.toFile(qrImagePath, qrData);

      updateData = {
        ...updateData,
        requestId,
        qrData,
        qrImage: `${requestId}.png`
      };
    }

    const updatedRequest = await VisitRequest.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    // ✅ Add notification for the admin
    if (status === 'accepted') {
      const adminUser = await User.findOne({ role: 'admin' }); // Assumes only one admin

      if (adminUser) {
        const newNotification = new Notification({
          user: adminUser._id,            // notify admin
          visitRequest: updatedRequest._id, // link the visit request
        });

        await newNotification.save();
      }
    }

    res.json({ success: true, message: `Request ${status}.`, request: updatedRequest });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};


export const getRequest = async (req, res) => {
  try {
    const requestId = req.params.id;

    const request = await VisitRequest.findById(requestId)

    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    return res.status(200).json({
      success: true,
      request
    });

  } catch (error) {
    console.error("Error in getRequest:", error);
    return res.status(500).json({ success: false, error: 'Server Error' });
  }
};


export const getRequests = async (req, res) => {
  try {
    const requests = await VisitRequest.find()

    return res.status(200).json({
      success: true,
      requests
    });
  } catch (error) {
    console.error("Error fetching all visit requests:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch all visit requests"
    });
  }
};

