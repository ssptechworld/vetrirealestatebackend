import cloudinary from '../config/cloudinary.js';
import fs from 'fs';

export const isCloudinaryConfigured = () => {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET &&
    process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name'
  );
};

export const uploadToCloudinary = async (filePath, folder = 'real-estate/properties') => {
  if (!isCloudinaryConfigured()) {
    return null;
  }
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      resource_type: 'auto'
    });
    // Remove local file after successful upload to Cloudinary
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return {
      secure_url: result.secure_url,
      public_id: result.public_id
    };
  } catch (err) {
    console.error('Cloudinary Upload Error:', err);
    throw err;
  }
};

export const deleteFromCloudinary = async (publicId) => {
  if (!isCloudinaryConfigured() || !publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error('Cloudinary Delete Error:', err);
  }
};
