import User from '../models/User.js';
import bcrypt from 'bcrypt'
import { response } from 'express';
import jwt from 'jsonwebtoken'

//verify user credintials
const login = async (req,res)=>{
    try {
        //distract the data from our request 
        const {email, password} = req.body;
        // after that we will use the eamil to fins the user
        const user = await User.findOne({email})
        if(!user){
            res.status(404).json({success: false, error:"User Not found"}) //not found
        }

        //if the email existed we will verify the password 
        const isMatch =await bcrypt.compare(password,user.password) //password passed , encrypted password
        if(!isMatch){
            res.status(404).json({success: false, error:"Wrong Password"}) //not found
        }
        //generate token for the session if the email and password validate we  will use GWT
        const token = jwt.sign(
            {_id: user._id, role: user.role},
            process.env.JWT_KEY, 
            {expiresIn:"10d"}
        ); 
        //payload data that will store inside this token +
        //+ secret key + when this token should expire ,, after 10d will not work , should log to the system
        
        //after generate token return response to front end
        res
        .status(200)
        .json({
            success: true, 
            token, 
            user:{_id: user._id, name: user.name, role: user.role} 
        }); 
        //in response we will return to front end those properties
    } catch (error) {
        // console.log(error)
        res.status(500).json({success: false ,error: error.message})
    }
}

const verify =(req,res) =>{
    //read the user from req bcz we attached it in middlware req.user= user
    return res.status(200).json({success: true, user: req.user})
}
export {login, verify};