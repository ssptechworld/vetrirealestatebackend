import mongoose from 'mongoose';
import Gallery from '../models/Gallery.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isCloudinaryConfigured, uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinaryUpload.js';
import cloudinary from '../config/cloudinary.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-Memory fallback store for when MongoDB is disconnected
let inMemoryGallery = [];

const isDBConnected = () => mongoose.connection.readyState === 1;

// Helper to safely delete file from local disk if stored locally
const deleteFileFromDisk = (mediaPath) => {
  if (!mediaPath || !mediaPath.startsWith('/uploads/')) return;
  try {
    const fullPath = path.join(__dirname, '..', mediaPath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (err) {
    console.error('Error deleting file from disk:', err.message);
  }
};

// @desc    Fetch all gallery media items (supports ?projectName= or ?grouped=true)
// @route   GET /api/gallery
export const getGalleryItems = async (req, res) => {
  try {
    const { projectName, grouped } = req.query;
    let items = [];

    if (isDBConnected()) {
      const filter = {};
      if (projectName) {
        filter.projectName = { $regex: new RegExp(`^${projectName}$`, 'i') };
      }
      items = await Gallery.find(filter).sort({ createdAt: -1 });
    } else {
      items = [...inMemoryGallery];
      if (projectName) {
        items = items.filter(
          (i) => i.projectName.toLowerCase() === projectName.toLowerCase()
        );
      }
    }

    if (grouped === 'true') {
      // Group items by completed project name
      const groupedData = items.reduce((acc, item) => {
        const key = item.projectName.trim();
        if (!acc[key]) {
          acc[key] = {
            projectName: key,
            location: item.location || '',
            description: item.description || '',
            completionYear: item.completionYear || '',
            media: []
          };
        }
        acc[key].media.push(item);
        return acc;
      }, {});

      return res.status(200).json(Object.values(groupedData));
    }

    return res.status(200).json(items);
  } catch (err) {
    console.error('Error fetching gallery items:', err.message);
    res.status(500).json({ message: 'Failed to fetch gallery items', error: err.message });
  }
};

// @desc    Fetch a single gallery item by ID
// @route   GET /api/gallery/:id
export const getGalleryItemById = async (req, res) => {
  try {
    const { id } = req.params;

    if (isDBConnected()) {
      const item = await Gallery.findById(id);
      if (!item) {
        return res.status(404).json({ message: 'Gallery item not found' });
      }
      return res.status(200).json(item);
    } else {
      const item = inMemoryGallery.find((i) => i._id.toString() === id);
      if (!item) {
        return res.status(404).json({ message: 'Gallery item not found' });
      }
      return res.status(200).json(item);
    }
  } catch (err) {
    console.error('Error fetching gallery item:', err.message);
    res.status(500).json({ message: 'Failed to fetch gallery item', error: err.message });
  }
};

// @desc    Upload multiple gallery media files for a completed project
// @route   POST /api/gallery
export const uploadGalleryMedia = async (req, res) => {
  try {
    const { projectName, location, description, completionYear } = req.body;

    if (!projectName) {
      return res.status(400).json({ message: 'Project name is required.' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'At least one image or video file is required.' });
    }

    const createdItems = [];

    for (const file of req.files) {
      let mediaUrl = `/uploads/gallery/${file.filename}`;
      let cloudinaryPublicId = '';
      const isVideo = file.mimetype.startsWith('video/');
      const mediaType = isVideo ? 'video' : 'image';

      // Upload to Cloudinary if configured
      if (isCloudinaryConfigured()) {
        try {
          const cloudRes = await uploadToCloudinary(file.path, 'real-estate/gallery');
          if (cloudRes && cloudRes.secure_url) {
            mediaUrl = cloudRes.secure_url;
            cloudinaryPublicId = cloudRes.public_id;
          }
        } catch (cloudErr) {
          console.error(`Failed to upload ${file.originalname} to Cloudinary, falling back to local storage:`, cloudErr.message);
        }
      }

      const newItemData = {
        projectName,
        location: location || '',
        description: description || '',
        completionYear: completionYear || '',
        mediaType,
        mediaUrl,
        cloudinaryPublicId
      };

      if (isDBConnected()) {
        const galleryDoc = new Gallery(newItemData);
        const savedDoc = await galleryDoc.save();
        createdItems.push(savedDoc);
      } else {
        const inMemDoc = {
          _id: new mongoose.Types.ObjectId().toString(),
          ...newItemData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        inMemoryGallery.unshift(inMemDoc);
        createdItems.push(inMemDoc);
      }
    }

    return res.status(201).json({
      message: `Successfully uploaded ${createdItems.length} media file(s) for ${projectName}.`,
      data: createdItems
    });
  } catch (err) {
    console.error('Error uploading gallery media:', err.message);
    res.status(500).json({ message: 'Failed to upload gallery media', error: err.message });
  }
};

// @desc    Update gallery metadata (project details)
// @route   PUT /api/gallery/:id
export const updateGalleryItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { projectName, location, description, completionYear } = req.body;

    if (isDBConnected()) {
      const item = await Gallery.findById(id);
      if (!item) {
        return res.status(404).json({ message: 'Gallery item not found' });
      }

      if (projectName !== undefined) item.projectName = projectName;
      if (location !== undefined) item.location = location;
      if (description !== undefined) item.description = description;
      if (completionYear !== undefined) item.completionYear = completionYear;

      const updated = await item.save();
      return res.status(200).json(updated);
    } else {
      const idx = inMemoryGallery.findIndex((i) => i._id.toString() === id);
      if (idx === -1) {
        return res.status(404).json({ message: 'Gallery item not found' });
      }

      inMemoryGallery[idx] = {
        ...inMemoryGallery[idx],
        projectName: projectName !== undefined ? projectName : inMemoryGallery[idx].projectName,
        location: location !== undefined ? location : inMemoryGallery[idx].location,
        description: description !== undefined ? description : inMemoryGallery[idx].description,
        completionYear: completionYear !== undefined ? completionYear : inMemoryGallery[idx].completionYear,
        updatedAt: new Date().toISOString()
      };

      return res.status(200).json(inMemoryGallery[idx]);
    }
  } catch (err) {
    console.error('Error updating gallery item:', err.message);
    res.status(500).json({ message: 'Failed to update gallery item', error: err.message });
  }
};

// @desc    Delete single gallery media item
// @route   DELETE /api/gallery/:id
export const deleteGalleryItem = async (req, res) => {
  try {
    const { id } = req.params;
    let targetItem = null;

    if (isDBConnected()) {
      targetItem = await Gallery.findById(id);
      if (!targetItem) {
        return res.status(404).json({ message: 'Gallery item not found' });
      }

      // Cleanup Cloudinary or Disk storage
      if (targetItem.cloudinaryPublicId) {
        const resourceType = targetItem.mediaType === 'video' ? 'video' : 'image';
        if (isCloudinaryConfigured()) {
          try {
            await cloudinary.uploader.destroy(targetItem.cloudinaryPublicId, { resource_type: resourceType });
          } catch (cErr) {
            console.error('Cloudinary destroy error:', cErr.message);
          }
        }
      } else {
        deleteFileFromDisk(targetItem.mediaUrl);
      }

      await Gallery.findByIdAndDelete(id);
    } else {
      const idx = inMemoryGallery.findIndex((i) => i._id.toString() === id);
      if (idx === -1) {
        return res.status(404).json({ message: 'Gallery item not found' });
      }
      targetItem = inMemoryGallery[idx];
      deleteFileFromDisk(targetItem.mediaUrl);
      inMemoryGallery.splice(idx, 1);
    }

    return res.status(200).json({ message: 'Gallery media deleted successfully', id });
  } catch (err) {
    console.error('Error deleting gallery item:', err.message);
    res.status(500).json({ message: 'Failed to delete gallery item', error: err.message });
  }
};

// @desc    Delete entire project and all associated gallery media
// @route   DELETE /api/gallery/project/:projectName
export const deleteGalleryProject = async (req, res) => {
  try {
    const { projectName } = req.params;
    let itemsToDelete = [];

    if (isDBConnected()) {
      itemsToDelete = await Gallery.find({
        projectName: { $regex: new RegExp(`^${projectName}$`, 'i') }
      });

      for (const item of itemsToDelete) {
        if (item.cloudinaryPublicId && isCloudinaryConfigured()) {
          const resourceType = item.mediaType === 'video' ? 'video' : 'image';
          try {
            await cloudinary.uploader.destroy(item.cloudinaryPublicId, { resource_type: resourceType });
          } catch (cErr) {
            console.error('Cloudinary destroy error:', cErr.message);
          }
        } else {
          deleteFileFromDisk(item.mediaUrl);
        }
      }

      await Gallery.deleteMany({
        projectName: { $regex: new RegExp(`^${projectName}$`, 'i') }
      });
    } else {
      itemsToDelete = inMemoryGallery.filter(
        (i) => i.projectName.toLowerCase() === projectName.toLowerCase()
      );

      itemsToDelete.forEach((item) => deleteFileFromDisk(item.mediaUrl));

      inMemoryGallery = inMemoryGallery.filter(
        (i) => i.projectName.toLowerCase() !== projectName.toLowerCase()
      );
    }

    return res.status(200).json({
      message: `Deleted project '${projectName}' and ${itemsToDelete.length} media item(s).`,
      count: itemsToDelete.length
    });
  } catch (err) {
    console.error('Error deleting gallery project:', err.message);
    res.status(500).json({ message: 'Failed to delete gallery project', error: err.message });
  }
};
