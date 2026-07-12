import { v2 as cloudinary } from "cloudinary";
import config from "./env";

// Configured Cloudinary SDK instance for media file uploads
cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
});

export default cloudinary;
