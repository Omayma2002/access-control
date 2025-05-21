import User from "./models/User.js"
import bcrypt from "bcrypt"
import connectToDatabase from "./db/db.js"

const userRegister = async ()=> {
    connectToDatabase()
    try {
        //hash the password (password ,salt for generating unique caracters)
        const hashPassword = await bcrypt.hash("admin",10)
        const newUser = new User({
            name: "Admin",
            email: "admin@gmail.com",
            password: hashPassword,
            role: "admin"
        })
        await newUser.save()
    } catch (error) {
        console.log(error)
    }
}

//call the function
userRegister();