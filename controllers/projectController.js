import mongoose from 'mongoose';
import Project from '../models/Project.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isCloudinaryConfigured, uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinaryUpload.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-Memory fallback store for when MongoDB is disconnected
let inMemoryProjects = [];

const isDBConnected = () => mongoose.connection.readyState === 1;

// Helper function to safely delete orphaned image file from disk
const deleteFileFromDisk = (imagePath) => {
  if (!imagePath || !imagePath.startsWith('/uploads/')) return;
  try {
    const fullPath = path.join(__dirname, '..', imagePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (err) {
    console.error('Error deleting file from disk:', err.message);
  }
};

// @desc    Create new project
// @route   POST /api/projects
export const createProject = async (req, res) => {
  try {
    const { name, location, type, status, price, description, bedrooms, area, completionDate, featured } = req.body;

    if (!name || !location || !price) {
      return res.status(400).json({ message: 'Name, location, and price are required fields.' });
    }

    const mainImageFile = req.files?.image?.[0] || (req.files?.images && req.files.images[0]) || req.file;
    const additionalImageFiles = req.files?.images || [];
    const brochureFile = req.files?.brochure?.[0];

    if (!mainImageFile && (!additionalImageFiles || additionalImageFiles.length === 0)) {
      return res.status(400).json({ message: 'Project image is required.' });
    }

    // Process primary image
    let imagePath = mainImageFile ? `/uploads/projects/${mainImageFile.filename}` : '';
    let publicId = '';

    if (mainImageFile && isCloudinaryConfigured()) {
      const cloudRes = await uploadToCloudinary(mainImageFile.path, 'real-estate/properties');
      if (cloudRes && cloudRes.secure_url) {
        imagePath = cloudRes.secure_url;
        publicId = cloudRes.public_id;
      }
    }

    // Process all project images (array)
    const allImages = [];
    if (imagePath) {
      allImages.push(imagePath);
    }

    if (additionalImageFiles && additionalImageFiles.length > 0) {
      for (const file of additionalImageFiles) {
        if (mainImageFile && (file.filename === mainImageFile.filename || (file.originalname === mainImageFile.originalname && file.size === mainImageFile.size))) continue;

        let extraPath = `/uploads/projects/${file.filename}`;
        if (isCloudinaryConfigured()) {
          try {
            const cloudRes = await uploadToCloudinary(file.path, 'real-estate/properties');
            if (cloudRes && cloudRes.secure_url) {
              extraPath = cloudRes.secure_url;
            }
          } catch (cErr) {
            console.error('Cloudinary multi-image upload error:', cErr.message);
          }
        }
        allImages.push(extraPath);
      }
    }

    if (!imagePath && allImages.length > 0) {
      imagePath = allImages[0];
    }

    // Process brochure if uploaded
    let brochureUrl = '';
    let brochurePublicId = '';

    if (brochureFile) {
      brochureUrl = `/uploads/projects/${brochureFile.filename}`;
      if (isCloudinaryConfigured()) {
        try {
          const cloudRes = await uploadToCloudinary(brochureFile.path, 'real-estate/brochures');
          if (cloudRes && cloudRes.secure_url) {
            brochureUrl = cloudRes.secure_url;
            brochurePublicId = cloudRes.public_id;
          }
        } catch (bErr) {
          console.error('Cloudinary brochure upload error:', bErr.message);
        }
      }
    }

    const isFeatured = featured === 'true' || featured === true;

    if (isDBConnected()) {
      const project = new Project({
        name,
        location,
        type: type || 'Apartment',
        status: status || 'ongoing',
        price,
        description: description || '',
        bedrooms: bedrooms || '3 BHK',
        area: area || '1800 Sq.Ft',
        completionDate: completionDate || '',
        image: imagePath,
        images: allImages.length > 0 ? allImages : [imagePath],
        public_id: publicId,
        brochureUrl,
        brochure_public_id: brochurePublicId,
        featured: isFeatured
      });

      const savedProject = await project.save();
      return res.status(201).json(savedProject);
    } else {
      const newProj = {
        _id: 'proj-' + Date.now(),
        name,
        location,
        type: type || 'Apartment',
        status: status || 'ongoing',
        price,
        description: description || '',
        bedrooms: bedrooms || '3 BHK',
        area: area || '1800 Sq.Ft',
        completionDate: completionDate || '',
        image: imagePath,
        images: allImages.length > 0 ? allImages : [imagePath],
        public_id: publicId,
        brochureUrl,
        brochure_public_id: brochurePublicId,
        featured: isFeatured,
        createdAt: new Date().toISOString()
      };
      inMemoryProjects.unshift(newProj);
      return res.status(201).json(newProj);
    }
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ message: 'Server error creating project', error: error.message });
  }
};

// @desc    Get all projects
// @route   GET /api/projects
export const getProjects = async (req, res) => {
  try {
    if (isDBConnected()) {
      const projects = await Project.find().sort({ createdAt: -1 });
      return res.status(200).json(projects);
    } else {
      return res.status(200).json(inMemoryProjects);
    }
  } catch (error) {
    res.status(200).json(inMemoryProjects);
  }
};

// @desc    Get single project by ID
// @route   GET /api/projects/:id
export const getProjectById = async (req, res) => {
  try {
    if (isDBConnected()) {
      const project = await Project.findById(req.params.id);
      if (project) return res.status(200).json(project);
    }
    const memProj = inMemoryProjects.find((p) => p._id === req.params.id);
    if (!memProj) {
      return res.status(404).json({ message: 'Project not found' });
    }
    return res.status(200).json(memProj);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching project', error: error.message });
  }
};

// @desc    Get ongoing projects
// @route   GET /api/projects/status/ongoing
export const getOngoingProjects = async (req, res) => {
  try {
    if (isDBConnected()) {
      const projects = await Project.find({ status: 'ongoing' }).sort({ createdAt: -1 });
      return res.status(200).json(projects);
    } else {
      const ongoing = inMemoryProjects.filter((p) => p.status === 'ongoing');
      return res.status(200).json(ongoing);
    }
  } catch (error) {
    const ongoing = inMemoryProjects.filter((p) => p.status === 'ongoing');
    return res.status(200).json(ongoing);
  }
};

// @desc    Get completed projects
// @route   GET /api/projects/status/completed
export const getCompletedProjects = async (req, res) => {
  try {
    if (isDBConnected()) {
      const projects = await Project.find({ status: 'completed' }).sort({ createdAt: -1 });
      return res.status(200).json(projects);
    } else {
      const completed = inMemoryProjects.filter((p) => p.status === 'completed');
      return res.status(200).json(completed);
    }
  } catch (error) {
    const completed = inMemoryProjects.filter((p) => p.status === 'completed');
    return res.status(200).json(completed);
  }
};

// @desc    Update project
// @route   PUT /api/projects/:id
export const updateProject = async (req, res) => {
  try {
    const { name, location, type, status, price, description, bedrooms, area, completionDate, featured, existingImages } = req.body;
    const isFeatured = featured === 'true' || featured === true;

    // Handle parsed existing images
    let retainedImages = [];
    if (existingImages) {
      try {
        retainedImages = typeof existingImages === 'string' ? JSON.parse(existingImages) : existingImages;
      } catch (e) {
        retainedImages = Array.isArray(existingImages) ? existingImages : [existingImages];
      }
    }

    const mainImageFile = req.files?.image?.[0] || req.file;
    const newImageFiles = req.files?.images || [];
    const brochureFile = req.files?.brochure?.[0];

    // Upload any newly uploaded additional images
    const newlyUploadedImages = [];
    for (const file of newImageFiles) {
      if (mainImageFile && file.filename === mainImageFile.filename) continue;

      let extraPath = `/uploads/projects/${file.filename}`;
      if (isCloudinaryConfigured()) {
        try {
          const cloudRes = await uploadToCloudinary(file.path, 'real-estate/properties');
          if (cloudRes && cloudRes.secure_url) {
            extraPath = cloudRes.secure_url;
          }
        } catch (cErr) {
          console.error('Cloudinary multi-image upload error:', cErr.message);
        }
      }
      newlyUploadedImages.push(extraPath);
    }

    // Process primary image if a new one was uploaded
    let newMainImagePath = '';
    let newMainPublicId = '';
    if (mainImageFile) {
      newMainImagePath = `/uploads/projects/${mainImageFile.filename}`;
      if (isCloudinaryConfigured()) {
        const cloudRes = await uploadToCloudinary(mainImageFile.path, 'real-estate/properties');
        if (cloudRes && cloudRes.secure_url) {
          newMainImagePath = cloudRes.secure_url;
          newMainPublicId = cloudRes.public_id;
        }
      }
    }

    // Process new brochure file if uploaded
    let newBrochureUrl = '';
    let newBrochurePublicId = '';
    if (brochureFile) {
      newBrochureUrl = `/uploads/projects/${brochureFile.filename}`;
      if (isCloudinaryConfigured()) {
        try {
          const cloudRes = await uploadToCloudinary(brochureFile.path, 'real-estate/brochures');
          if (cloudRes && cloudRes.secure_url) {
            newBrochureUrl = cloudRes.secure_url;
            newBrochurePublicId = cloudRes.public_id;
          }
        } catch (bErr) {
          console.error('Cloudinary brochure upload error:', bErr.message);
        }
      }
    }

    if (isDBConnected()) {
      const project = await Project.findById(req.params.id);
      if (project) {
        if (name) project.name = name;
        if (location) project.location = location;
        if (type) project.type = type;
        if (status) project.status = status;
        if (price) project.price = price;
        if (description !== undefined) project.description = description;
        if (bedrooms) project.bedrooms = bedrooms;
        if (area) project.area = area;
        if (completionDate !== undefined) project.completionDate = completionDate;
        if (featured !== undefined) project.featured = isFeatured;

        // Determine base images list
        let currentImages = existingImages !== undefined ? retainedImages : (project.images || [project.image]);
        if (newMainImagePath && !currentImages.includes(newMainImagePath)) {
          currentImages.unshift(newMainImagePath);
        }
        currentImages = [...currentImages, ...newlyUploadedImages];

        // Ensure no empty or duplicates
        project.images = Array.from(new Set(currentImages.filter(Boolean)));

        if (newMainImagePath) {
          if (project.public_id) {
            await deleteFromCloudinary(project.public_id);
          } else {
            deleteFileFromDisk(project.image);
          }
          project.image = newMainImagePath;
          project.public_id = newMainPublicId;
        } else if (project.images.length > 0) {
          project.image = project.images[0];
        }

        // Handle brochure replacement
        if (newBrochureUrl) {
          if (project.brochure_public_id) {
            await deleteFromCloudinary(project.brochure_public_id, 'raw');
          } else if (project.brochureUrl) {
            deleteFileFromDisk(project.brochureUrl);
          }
          project.brochureUrl = newBrochureUrl;
          project.brochure_public_id = newBrochurePublicId;
        }

        const updatedProject = await project.save();
        return res.status(200).json(updatedProject);
      }
    }

    // In-memory fallback update
    const index = inMemoryProjects.findIndex((p) => p._id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const current = inMemoryProjects[index];
    let currentImages = existingImages !== undefined ? retainedImages : (current.images || [current.image]);
    if (newMainImagePath && !currentImages.includes(newMainImagePath)) {
      currentImages.unshift(newMainImagePath);
    }
    currentImages = [...currentImages, ...newlyUploadedImages];
    const finalImages = Array.from(new Set(currentImages.filter(Boolean)));

    let finalMainImage = newMainImagePath || current.image;
    let finalPublicId = newMainPublicId || current.public_id || '';
    if (!newMainImagePath && finalImages.length > 0) {
      finalMainImage = finalImages[0];
    }

    let finalBrochureUrl = newBrochureUrl || current.brochureUrl || '';
    let finalBrochurePublicId = newBrochurePublicId || current.brochure_public_id || '';

    inMemoryProjects[index] = {
      ...current,
      name: name || current.name,
      location: location || current.location,
      type: type || current.type,
      status: status || current.status,
      price: price || current.price,
      description: description !== undefined ? description : current.description,
      bedrooms: bedrooms || current.bedrooms,
      area: area || current.area,
      completionDate: completionDate !== undefined ? completionDate : current.completionDate,
      featured: featured !== undefined ? isFeatured : current.featured,
      image: finalMainImage,
      images: finalImages,
      public_id: finalPublicId,
      brochureUrl: finalBrochureUrl,
      brochure_public_id: finalBrochurePublicId,
      updatedAt: new Date().toISOString()
    };

    return res.status(200).json(inMemoryProjects[index]);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ message: 'Server error updating project', error: error.message });
  }
};

// @desc    Delete project
// @route   DELETE /api/projects/:id
export const deleteProject = async (req, res) => {
  try {
    if (isDBConnected()) {
      const project = await Project.findById(req.params.id);
      if (project) {
        if (project.public_id) {
          await deleteFromCloudinary(project.public_id);
        } else {
          deleteFileFromDisk(project.image);
        }
        if (project.brochure_public_id) {
          await deleteFromCloudinary(project.brochure_public_id, 'raw');
        } else if (project.brochureUrl) {
          deleteFileFromDisk(project.brochureUrl);
        }
        await project.deleteOne();
        return res.status(200).json({ message: 'Project deleted successfully' });
      }
    }

    const index = inMemoryProjects.findIndex((p) => p._id === req.params.id);
    if (index !== -1) {
      const proj = inMemoryProjects[index];
      if (proj.public_id) {
        await deleteFromCloudinary(proj.public_id);
      } else {
        deleteFileFromDisk(proj.image);
      }
      if (proj.brochure_public_id) {
        await deleteFromCloudinary(proj.brochure_public_id, 'raw');
      } else if (proj.brochureUrl) {
        deleteFileFromDisk(proj.brochureUrl);
      }
      inMemoryProjects.splice(index, 1);
      return res.status(200).json({ message: 'Project deleted successfully' });
    }

    return res.status(404).json({ message: 'Project not found' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ message: 'Server error deleting project', error: error.message });
  }
};

// @desc    Update project status only
// @route   PATCH /api/projects/:id/status
export const updateProjectStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['ongoing', 'completed'].includes(status)) {
      return res.status(400).json({ message: 'Status must be either ongoing or completed' });
    }

    if (isDBConnected()) {
      const project = await Project.findById(req.params.id);
      if (project) {
        project.status = status;
        const updatedProject = await project.save();
        return res.status(200).json(updatedProject);
      }
    }

    const index = inMemoryProjects.findIndex((p) => p._id === req.params.id);
    if (index !== -1) {
      inMemoryProjects[index].status = status;
      return res.status(200).json(inMemoryProjects[index]);
    }

    return res.status(404).json({ message: 'Project not found' });
  } catch (error) {
    res.status(500).json({ message: 'Server error updating status', error: error.message });
  }
};
