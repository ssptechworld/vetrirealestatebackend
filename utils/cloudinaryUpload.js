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

export const uploadToCloudinary = async (filePath, folder = 'real-estate/properties', options = {}) => {
  if (!isCloudinaryConfigured()) {
    return null;
  }
  try {
    const isPdf = typeof filePath === 'string' && filePath.toLowerCase().endsWith('.pdf');
    const uploadOptions = {
      folder: folder,
      resource_type: options.resource_type || (isPdf ? 'raw' : 'auto'),
      ...options
    };
    const result = await cloudinary.uploader.upload(filePath, uploadOptions);
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

export const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  if (!isCloudinaryConfigured() || !publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    console.error('Cloudinary Delete Error:', err);
  }
};
