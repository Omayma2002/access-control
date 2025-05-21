import Building from "../models/Building.js";
import Resident from "../models/Resident.js"
import Visitor from "../models/Visitor.js"
import Block from "../models/Block.js"
import { generateVisitorId } from '../utils/generateVisitorId.js';
import QRCode from "qrcode";
import EntryLog from "../models/EntryLog.js";

export const addVisitor = async (req, res) => {
  const visitorId = generateVisitorId();
  const qrData = visitorId;
  const qrImagePath = `public/qrcodes/visitors/${visitorId}.png`;
  console.log(req.user._id, "req.user._id")

  try {
      const {
          fullName,
          phone,
          visitTimeFrom,
          visitTimeTo,
          relationship,
          residentId // 🛠️ here
      } = req.body;

      const existingVisitorByPhone = await Visitor.findOne({ phone });
      if (existingVisitorByPhone) {
          return res.status(400).json({ success: false, error: "Phone number already registered" });
      }

      const building = await Building.findOne();
      if (!building) {
          return res.status(500).json({ success: false, error: "Building configuration not found" });
      }

      let resident;
      if (residentId) {
          resident = await Resident.findById(residentId);
      } else {
          resident = await Resident.findOne({ userId: req.user._id });
      }

      if (!resident) {
          return res.status(404).json({ success: false, error: "Resident not found" });
      }

      const currentVisitorCount = await Visitor.countDocuments({ resident: resident._id });

      if (currentVisitorCount >= building.maxVisitorsPerResident) {
          return res.status(400).json({
              success: false,
              error: "Maximum number of Visitor for this List reached",
          });
      }

      await QRCode.toFile(qrImagePath, qrData);

      const newVisitor = new Visitor({
          visitorId,
          fullName,
          phone,
          visitTimeFrom,
          visitTimeTo,
          relationship,
          resident: resident._id,
          qrCodeData: qrData,
          qrCodeImage: `${visitorId}.png`
      });

      await newVisitor.save();

      resident.visitors.push(newVisitor._id);
      await resident.save();

      return res.status(200).json({ success: true, message: "Visitor created and linked to resident successfully" });

  } catch (error) {
      console.error("Error adding Visitor:", error.message);
      return res.status(500).json({ success: false, message: "Server error in adding Visitor" });
  }
};

  
export const getVisitors = async (req, res) => {
  try {
    // Assuming `id` is the userId
    // console.log("req.params.id", req.params.id);

    // Step 1: Find the Resident using the userId (from req.params.id)
    const resident = await Resident.findOne({ userId: req.params.id }).populate('visitors');

    if (!resident) {
      return res.status(404).json({ success: false, message: "Resident not found" });
    }

    // console.log("Resident found:", resident);

    // Step 2: Fetch the visitors associated with this resident
    const visitors = resident.visitors;

    // Step 3: Add status to each visitor
    const visitorsWithStatus = await Promise.all(
      visitors.map(async (visitor) => {
        let isBlocked = await Block.findOne({ visitor: visitor._id });
    
        // ⏱ Check for expiry
        if (isBlocked && new Date(isBlocked.toDateTime) < new Date()) {
          await isBlocked.deleteOne(); // Automatically unblock
          isBlocked = null; // Set to null after deleting
        }
    
        return {
          ...visitor.toObject(),
          status: isBlocked ? "Blocked" : "Active",
        };
      })
    );
    

    // Step 4: Return the visitors list with status
    return res.status(200).json({ success: true, visitors: visitorsWithStatus });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: "get visitors server error" });
  }
};


export const deleteVisitor = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the visitor
    const visitor = await Visitor.findById(id);
    if (!visitor) {
      return res.status(404).json({ success: false, error: "Visitor not found" });
    }

    // Delete entry logs related to this visitor
    await EntryLog.deleteMany({ visitor: visitor._id });
    await Block.deleteMany({ visitor: visitor._id });

    // Delete the visitor
    await visitor.deleteOne();

    // Remove from resident's visitors array
    await Resident.updateOne(
      { visitors: visitor._id },
      { $pull: { visitors: visitor._id } }
    );

    return res.status(200).json({ 
      success: true, 
      message: "Visitor and associated entry logs deleted successfully" 
    });

  } catch (error) {
    console.error("Error deleting visitor:", error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || "Failed to delete visitor" 
    });
  }
};


export const getVisitor = async (req,res)=>{
    // console.log("req.params.id", req.params.id);
    const {id} = req.params;
    // console.log("Visitor ID:", id)
    try {
        let visitor;
        visitor = await Visitor.findById({_id: id}) 

        return res.status(200).json({success: true, visitor})
    } catch (error) {
        return res.status(500).json({success: false,error: "get Visitor server error"})
    }
}

export const blockVisitor = async (req, res) => {
  const { id } = req.params;
  const { reason, from, fromTime, to, toTime } = req.body;

  try {
    const visitor = await Visitor.findById(id);
    if (!visitor) {
      return res.status(404).json({ success: false, error: "Visitor not found" });
    }

    const fromDateTime = new Date(`${from}T${fromTime}`);
    const toDateTime = new Date(`${to}T${toTime}`);

    // Check if a block already exists for this visitor
    const existingBlock = await Block.findOne({ visitor: id });
    if (existingBlock) {
      return res.status(400).json({ success: false, error: "Visitor already blocked." });
    }

    const blockedBy = req.user.id; // 🛑 Make sure `req.user` exists from your auth middleware

    const blockEntry = new Block({
      visitor: id,
      reason,
      blockedBy,
      fromDateTime,
      toDateTime
    });

    await blockEntry.save();

    return res.status(200).json({ success: true, message: "Visitor blocked successfully" });
  } catch (error) {
    console.error("Error blocking Visitor:", error.message);
    return res.status(500).json({ success: false, error: "Server error while blocking Visitor" });
  }
}

export const unblockVisitor = async (req, res) => {
  const { id } = req.params;

  try {
    const blockEntry = await Block.findOne({ visitor: id });
    if (!blockEntry) {
      return res.status(404).json({ success: false, error: "Block entry not found" });
    }

    await blockEntry.deleteOne();

    return res.status(200).json({ success: true, message: "Visitor unblocked successfully" });
  } catch (error) {
    console.error("Error unblocking Visitor:", error.message);
    return res.status(500).json({ success: false, error: "Server error while unblocking Visitor" });
  }
}


export const getVisitorsByResidentId = async (req, res) => {
  try {
    // Find the Resident by Resident _id 
    const resident = await Resident.findById(req.params.id).populate('visitors');

    if (!resident) {
      return res.status(404).json({ success: false, message: "Resident not found" });
    }

    const visitors = resident.visitors;

    // Step 3: Add status to each visitor
    const visitorsWithStatus = await Promise.all(
      visitors.map(async (visitor) => {
        let isBlocked = await Block.findOne({ visitor: visitor._id });
    
        // ⏱ Check for expiry
        if (isBlocked && new Date(isBlocked.toDateTime) < new Date()) {
          await isBlocked.deleteOne(); // Automatically unblock
          isBlocked = null; // Set to null after deleting
        }
    
        return {
          ...visitor.toObject(),
          status: isBlocked ? "Blocked" : "Active",
        };
      })
    );

    return res.status(200).json({ success: true, visitors: visitorsWithStatus });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: "get visitors server error" });
  }
};

export const addVisitorByAdmin = async (req, res) => {
  const visitorId = generateVisitorId();
  const qrData = visitorId;
  const qrImagePath = `public/qrcodes/visitors/${visitorId}.png`;
  console.log(req.user._id, "req.user._id")

  try {
      const {
          fullName,
          phone,
          visitTimeFrom,
          visitTimeTo,
          relationship,
          residentId // 🛠️ here
      } = req.body;

      const existingVisitorByPhone = await Visitor.findOne({ phone });
      if (existingVisitorByPhone) {
          return res.status(400).json({ success: false, error: "Phone number already registered" });
      }

      const building = await Building.findOne();
      if (!building) {
          return res.status(500).json({ success: false, error: "Building configuration not found" });
      }

      let resident;
      if (residentId) {
          resident = await Resident.findById(residentId);
      } else {
          resident = await Resident.findOne({ userId: req.user._id });
      }

      if (!resident) {
          return res.status(404).json({ success: false, error: "Resident not found" });
      }

      const currentVisitorCount = await Visitor.countDocuments({ resident: resident._id });

      if (currentVisitorCount >= building.maxVisitorsPerResident) {
          return res.status(400).json({
              success: false,
              error: "Maximum number of Visitor for this List reached",
          });
      }

      await QRCode.toFile(qrImagePath, qrData);

      const newVisitor = new Visitor({
          visitorId,
          fullName,
          phone,
          visitTimeFrom,
          visitTimeTo,
          relationship,
          resident: resident._id,
          qrCodeData: qrData,
          qrCodeImage: `${visitorId}.png`
      });

      await newVisitor.save();

      resident.visitors.push(newVisitor._id);
      await resident.save();

      return res.status(200).json({ success: true, message: "Visitor created and linked to resident successfully" });

  } catch (error) {
      console.error("Error adding Visitor:", error.message);
      return res.status(500).json({ success: false, message: "Server error in adding Visitor" });
  }
}

// export const updateVisitor = async (req, res) => {
//   const { id } = req.params;
//   const { fullName, phone, visitTimeFrom, visitTimeTo, relationship } = req.body;

//   try {
//     const visitor = await Visitor.findById(id);
//     if (!visitor) {
//       return res.status(404).json({ success: false, error: "Visitor not found" });
//     }

//     visitor.fullName = fullName;
//     visitor.phone = phone;
//     visitor.visitTimeFrom = visitTimeFrom;
//     visitor.visitTimeTo = visitTimeTo;
//     visitor.relationship = relationship;

//     await visitor.save();

//     return res.status(200).json({ success: true, message: "Visitor updated successfully" });
//   } catch (error) {
//     console.error("Error updating Visitor:", error.message);
//     return res.status(500).json({ success: false, error: "Server error while updating Visitor" });
//   }
// }

export const updateVisitor = async (req, res) => {
    try {
      const { id } = req.params;
      const {phone, visitTimeFrom, visitTimeTo } = req.body;
  
      const visitor = await Visitor.findById({ _id: id });
      if (!visitor) {
        return res.status(404).json({ success: false, error: "Visitor not found" });
      }

      const updateVisitor = await Visitor.findByIdAndUpdate(
        { _id: id },
        { phone, visitTimeFrom, visitTimeTo }
      );
  
      if (!updateVisitor) {
        return res.status(404).json({ success: false, error: "Update failed" });
      }
  
      return res.status(200).json({ success: true, message: "Visitor updated successfully" });
  
    } catch (error) {
      console.error("❌ update Visitor error:", error);
      return res.status(500).json({ success: false, error: "Update Visitor server error" });
    }
  };