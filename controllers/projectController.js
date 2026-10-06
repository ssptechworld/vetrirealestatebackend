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

    // Process brochure if uploaded - STORE DIRECTLY IN MONGODB AS BUFFER (BYPASS CLOUDINARY)
    let brochureData = null;
    let hasBrochure = false;

    if (brochureFile) {
      try {
        const fileBuffer = fs.readFileSync(brochureFile.path);
        const brochureFilename = brochureFile.originalname || `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-brochure.pdf`;
        brochureData = {
          data: fileBuffer,
          contentType: brochureFile.mimetype || 'application/pdf',
          filename: brochureFilename,
          size: brochureFile.size || fileBuffer.length
        };
        hasBrochure = true;

        // Clean up temporary upload file from disk
        try {
          if (fs.existsSync(brochureFile.path)) {
            fs.unlinkSync(brochureFile.path);
          }
        } catch (cleanupErr) {
          console.error('Error cleaning up temp brochure file:', cleanupErr.message);
        }
      } catch (readErr) {
        console.error('Error reading brochure buffer:', readErr);
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
        brochure: brochureData,
        hasBrochure,
        featured: isFeatured
      });

      if (hasBrochure) {
        project.brochureUrl = `/api/projects/${project._id}/brochure`;
      }

      const savedProject = await project.save();
      const result = savedProject.toObject();
      if (result.brochure) {
        delete result.brochure.data;
      }
      return res.status(201).json(result);
    } else {
      const newId = 'proj-' + Date.now();
      const newProj = {
        _id: newId,
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
        brochure: brochureData,
        hasBrochure,
        brochureUrl: hasBrochure ? `/api/projects/${newId}/brochure` : '',
        featured: isFeatured,
        createdAt: new Date().toISOString()
      };
      inMemoryProjects.unshift(newProj);
      const resProj = { ...newProj };
      if (resProj.brochure) {
        resProj.brochure = { ...resProj.brochure, data: undefined };
      }
      return res.status(201).json(resProj);
    }
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ message: 'Server error creating project', error: error.message });
  }
};

// Helper to strip bulky binary buffer from JSON responses while providing brochure status and endpoint
const sanitizeProject = (proj) => {
  if (!proj) return null;
  const p = proj.toObject ? proj.toObject() : { ...proj };
  const hasBrochure = Boolean(p.hasBrochure || (p.brochure && (p.brochure.filename || p.brochure.size || p.brochure.data)));
  if (hasBrochure && !p.brochureUrl) {
    p.brochureUrl = `/api/projects/${p._id}/brochure`;
  }
  p.hasBrochure = hasBrochure;
  if (p.brochure && p.brochure.data) {
    p.brochure = { ...p.brochure };
    delete p.brochure.data;
  }
  return p;
};

// @desc    Get all projects
// @route   GET /api/projects
export const getProjects = async (req, res) => {
  try {
    if (isDBConnected()) {
      const projects = await Project.find().select('-brochure.data').sort({ createdAt: -1 });
      return res.status(200).json(projects.map(sanitizeProject));
    } else {
      return res.status(200).json(inMemoryProjects.map(sanitizeProject));
    }
  } catch (error) {
    res.status(200).json(inMemoryProjects.map(sanitizeProject));
  }
};

// @desc    Get single project by ID
// @route   GET /api/projects/:id
export const getProjectById = async (req, res) => {
  try {
    if (isDBConnected()) {
      if (mongoose.Types.ObjectId.isValid(req.params.id)) {
        const project = await Project.findById(req.params.id).select('-brochure.data');
        if (project) return res.status(200).json(sanitizeProject(project));
      }
    }
    const memProj = inMemoryProjects.find((p) => p._id === req.params.id);
    if (!memProj) {
      return res.status(404).json({ message: 'Project not found' });
    }
    return res.status(200).json(sanitizeProject(memProj));
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching project', error: error.message });
  }
};

// @desc    Get ongoing projects
// @route   GET /api/projects/status/ongoing
export const getOngoingProjects = async (req, res) => {
  try {
    if (isDBConnected()) {
      const projects = await Project.find({ status: 'ongoing' }).select('-brochure.data').sort({ createdAt: -1 });
      return res.status(200).json(projects.map(sanitizeProject));
    } else {
      const ongoing = inMemoryProjects.filter((p) => p.status === 'ongoing');
      return res.status(200).json(ongoing.map(sanitizeProject));
    }
  } catch (error) {
    const ongoing = inMemoryProjects.filter((p) => p.status === 'ongoing');
    return res.status(200).json(ongoing.map(sanitizeProject));
  }
};

// @desc    Get completed projects
// @route   GET /api/projects/status/completed
export const getCompletedProjects = async (req, res) => {
  try {
    if (isDBConnected()) {
      const projects = await Project.find({ status: 'completed' }).select('-brochure.data').sort({ createdAt: -1 });
      return res.status(200).json(projects.map(sanitizeProject));
    } else {
      const completed = inMemoryProjects.filter((p) => p.status === 'completed');
      return res.status(200).json(completed.map(sanitizeProject));
    }
  } catch (error) {
    const completed = inMemoryProjects.filter((p) => p.status === 'completed');
    return res.status(200).json(completed.map(sanitizeProject));
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

    // Process new brochure file if uploaded - STORE DIRECTLY IN MONGODB AS BUFFER (BYPASS CLOUDINARY)
    let newBrochureData = null;
    if (brochureFile) {
      try {
        const fileBuffer = fs.readFileSync(brochureFile.path);
        const brochureFilename = brochureFile.originalname || `${(name || 'project').toLowerCase().replace(/[^a-z0-9]/g, '-')}-brochure.pdf`;
        newBrochureData = {
          data: fileBuffer,
          contentType: brochureFile.mimetype || 'application/pdf',
          filename: brochureFilename,
          size: brochureFile.size || fileBuffer.length
        };
        // Clean up temp file
        try {
          if (fs.existsSync(brochureFile.path)) {
            fs.unlinkSync(brochureFile.path);
          }
        } catch (cleanupErr) {
          console.error('Error removing temp brochure file:', cleanupErr.message);
        }
      } catch (readErr) {
        console.error('Error reading brochure buffer:', readErr.message);
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
        if (newBrochureData) {
          if (project.brochure_public_id) {
            try {
              await deleteFromCloudinary(project.brochure_public_id, 'raw');
            } catch (delErr) {
              console.error('Error deleting old brochure from Cloudinary:', delErr.message);
            }
            project.brochure_public_id = '';
          }
          project.brochure = newBrochureData;
          project.hasBrochure = true;
          project.brochureUrl = `/api/projects/${project._id}/brochure`;
        }

        const updatedProject = await project.save();
        return res.status(200).json(sanitizeProject(updatedProject));
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

    if (newBrochureData) {
      current.brochure = newBrochureData;
      current.hasBrochure = true;
      current.brochureUrl = `/api/projects/${current._id}/brochure`;
    }

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
      updatedAt: new Date().toISOString()
    };

    return res.status(200).json(sanitizeProject(inMemoryProjects[index]));
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ message: 'Server error updating project', error: error.message });
  }
};

// @desc    Download project brochure directly from MongoDB
// @route   GET /api/projects/:id/brochure
export const getProjectBrochure = async (req, res) => {
  try {
    const { id } = req.params;

    let project = null;
    if (isDBConnected()) {
      if (mongoose.Types.ObjectId.isValid(id)) {
        project = await Project.findById(id);
      }
    }

    if (!project) {
      project = inMemoryProjects.find((p) => p._id === id);
    }

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Check if brochure Buffer exists in MongoDB
    if (project.brochure && project.brochure.data) {
      const mimeType = project.brochure.contentType || 'application/pdf';
      let filename = project.brochure.filename || `${project.name ? project.name.toLowerCase().replace(/[^a-z0-9]/g, '-') : 'project'}-brochure.pdf`;
      if (!filename.toLowerCase().endsWith('.pdf')) {
        filename += '.pdf';
      }

      const buffer = Buffer.isBuffer(project.brochure.data)
        ? project.brochure.data
        : Buffer.from(project.brochure.data);

      res.set({
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length,
        'Cache-Control': 'no-cache'
      });

      return res.send(buffer);
    }

    // Fallback: If legacy brochureUrl exists (e.g. from older uploads before direct buffer storage)
    if (project.brochureUrl) {
      if (project.brochureUrl.startsWith('http://') || project.brochureUrl.startsWith('https://')) {
        return res.redirect(project.brochureUrl);
      }
      const localFilePath = path.join(__dirname, '..', project.brochureUrl);
      if (fs.existsSync(localFilePath)) {
        return res.download(localFilePath, `${project.name || 'project'}-brochure.pdf`);
      }
    }

    return res.status(404).json({ message: 'Brochure not found for this project' });
  } catch (error) {
    console.error('Error fetching project brochure:', error);
    return res.status(500).json({ message: 'Error retrieving brochure', error: error.message });
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
