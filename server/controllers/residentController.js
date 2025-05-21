import Resident from "../models/Resident.js"
import User from "../models/User.js"
import bcrypt from 'bcrypt'
import multer from "multer"
import path from "path";
import Building from "../models/Building.js"; 
import { generateResidentId } from '../utils/generateResidentId.js';
import QRCode from "qrcode";
import fs from "fs";
import Block from '../models/Block.js'


//handle file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) =>{
        cb(null, "public/uploads") //path to store file
    },
    //assign unique name for files
    filename: (req, file, cb)=>{
        cb(null, Date.now() + path.extname(file.originalname))
        // 123456789 omayma.png => 123456789.png
    }
})
const upload =multer({storage: storage})

const addResident = async (req, res) => {
    const residentId = generateResidentId();
    const qrData = residentId;
    const qrImagePath = `public/qrcodes/residents/${residentId}.png`; // 👈 path to save
    const role = "resident"; // 👈 default role for residents
  
    try {
      const {
        name,
        email,
        phone,
        gender,
        maritalStatus,
        residentType,
        apartment,
        password,
      } = req.body;

      // Check if the user already exists by email
      const existingUserByEmail = await User.findOne({ email });
      if (existingUserByEmail) {
        return res.status(400).json({ success: false, error: "Email already registered" });
      }
  
      // Check if the phone number already exists
      const existingUserByPhone = await User.findOne({ phone });
      if (existingUserByPhone) {
        return res.status(400).json({ success: false, error: "Phone number already registered" });
      }
  
      const building = await Building.findOne();
      if (!building) {
        return res.status(500).json({ success: false, error: "Building configuration not found" });
      }
  
      const currentResidentCount = await Resident.countDocuments({ apartment });
  
      if (currentResidentCount >= building.residentsPerApartment) {
        return res.status(400).json({
          success: false,
          error: "Maximum number of residents for this apartment reached",
        });
      }
  
      const hashedPassword = await bcrypt.hash(password, 10);
  
      const newUser = new User({
        name,
        email,
        phone,  
        password: hashedPassword,
        role,
        profileImage: req.file ? req.file.filename : "",
      });
      const savedUser = await newUser.save();
  
      // 👉 Generate QR image and save to disk
      await QRCode.toFile(qrImagePath, qrData);
  
      const newResident = new Resident({
        userId: savedUser._id,
        residentId,
        gender,
        maritalStatus,
        residentType,
        apartment,
        qrCodeData: qrData,
        qrCodeImage: `${residentId}.png`  // Just filename (or full path if needed)
      });
      
      await newResident.save();
  
      return res.status(200).json({ success: true, message: "Resident created successfully" });
    } catch (error) {
      console.error("Error adding resident:", error.message);
      return res.status(500).json({ success: false, message: "Server error in adding resident" });
    }
};
  
const getResidents = async (req, res) => {
  try {
    const residents = await Resident.find()
      .populate('userId', { password: 0 })
      .populate('apartment');

    const now = new Date();

    const residentsWithStatus = await Promise.all(
      residents.map(async (resident) => {
        const blockEntry = await Block.findOne({ resident: resident._id });

        // If block exists and has expired, delete it
        if (blockEntry && blockEntry.toDateTime < now) {
          await blockEntry.deleteOne();
        }

        const stillBlocked = await Block.findOne({ resident: resident._id });

        return {
          ...resident.toObject(),
          status: stillBlocked ? "Blocked" : "Active",
        };
      })
    );

    return res.status(200).json({ success: true, residents: residentsWithStatus });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: "get residents server error" });
  }
};


const getResident = async (req,res)=>{
    const {id} = req.params;
    try {
        let resident;
        resident = await Resident.findById({_id: id}).populate('userId', {password: 0}).populate('apartment') //0 do not return password
        if(!resident){
            //check with user Id bcz it's inside resident
            resident = await Resident.findOne({userId: id}).
            populate('userId', {password: 0}).
            populate('apartment') 
        }
        //when we find resident retun based on user id user details
        return res.status(200).json({success: true, resident})
    } catch (error) {
        return res.status(500).json({success: false,error: "get Resident server error"})
    }
}

const updateResident = async (req, res) => {
    try {
      const { id } = req.params;
      const { name, maritalStatus, residentType, apartment } = req.body;
  
      const resident = await Resident.findById({ _id: id });
      if (!resident) {
        return res.status(404).json({ success: false, error: "Resident not found" });
      }
  
      const user = await User.findById({ _id: resident.userId });
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }
  
      // If the apartment is being changed
      if (resident.apartment !== apartment) {
        // Find the building of the resident (assuming resident has a buildingId or similar)
        const building = await Building.findOne(); // adjust this if needed to find specific building
        if (!building) {
          return res.status(404).json({ success: false, error: "Building not found" });
        }
  
        // Count residents in the target apartment
        const residentCount = await Resident.countDocuments({ apartment });
  
        if (residentCount >= building.residentsPerApartment) {
          return res.status(400).json({ success: false, error: "Apartment already full" });
        }
      }
  
      // Update both user and resident
      const updateUser = await User.findByIdAndUpdate({ _id: resident.userId }, { name });
      const updateResident = await Resident.findByIdAndUpdate(
        { _id: id },
        { maritalStatus, residentType, apartment }
      );
  
      if (!updateUser || !updateResident) {
        return res.status(404).json({ success: false, error: "Update failed" });
      }
  
      return res.status(200).json({ success: true, message: "Resident updated successfully" });
  
    } catch (error) {
      console.error("❌ update Resident error:", error);
      return res.status(500).json({ success: false, error: "Update Resident server error" });
    }
  };
  

const fetchResidentsByAprtId = async (req,res)=>{
    const {id} = req.params; //arpt id
    try {
        const residents = await Resident.find({apartment: id}) 
        return res.status(200).json({success: true, residents})
    } catch (error) {
        return res.status(500).json({success: false,error: "get ResidentByArptID server error"})
    }
}

const deleteResident = async (req,res) =>{
  try {
      const {id} = req.params;
      const residentToDelete = await Resident.findById(id);
      
      if (!residentToDelete) {
          return res.status(404).json({ success: false, error: "Resident not found" });
      }
      
      await residentToDelete.deleteOne();
      return res.status(200).json({
          success: true, 
          message: "Resident deleted successfully",
          deletedResident: residentToDelete
      });
  } catch (error) {
      console.error("Delete resident error:", error);
      return res.status(500).json({
          success: false,
          error: error.message || "Failed to delete resident"
      });
  }
}

const blockResident = async (req, res) => {
  const { id } = req.params;
  const { reason, from, fromTime, to, toTime } = req.body;

  try {
    const resident = await Resident.findById(id);
    if (!resident) {
      return res.status(404).json({ success: false, error: "Resident not found" });
    }

    const fromDateTime = new Date(`${from}T${fromTime}`);
    const toDateTime = new Date(`${to}T${toTime}`);

    // Check if a block already exists for this resident
    const existingBlock = await Block.findOne({ resident: id });
    if (existingBlock) {
      return res.status(400).json({ success: false, error: "Resident already blocked." });
    }

    const blockedBy = req.user.id; // 🛑 Make sure `req.user` exists from your auth middleware

    const blockEntry = new Block({
      resident: id,
      reason,
      blockedBy,
      fromDateTime,
      toDateTime
    });

    await blockEntry.save();

    return res.status(200).json({ success: true, message: "Resident blocked successfully" });
  } catch (error) {
    console.error("Error blocking resident:", error.message);
    return res.status(500).json({ success: false, error: "Server error while blocking resident" });
  }
}

const unblockResident = async (req, res) => {
  const { id } = req.params;

  try {
    const blockEntry = await Block.findOne({ resident: id });
    if (!blockEntry) {
      return res.status(404).json({ success: false, error: "Block entry not found" });
    }

    await blockEntry.deleteOne();

    return res.status(200).json({ success: true, message: "resident unblocked successfully" });
  } catch (error) {
    console.error("Error unblocking resident:", error.message);
    return res.status(500).json({ success: false, error: "Server error while unblocking resident" });
  }
}

export {addResident,upload,getResidents,getResident,
  updateResident,fetchResidentsByAprtId,deleteResident,blockResident, unblockResident}