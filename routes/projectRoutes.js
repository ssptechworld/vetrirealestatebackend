import express from 'express';
import {
  createProject,
  getProjects,
  getOngoingProjects,
  getCompletedProjects,
  getProjectById,
  updateProject,
  deleteProject,
  updateProjectStatus,
  getProjectBrochure
} from '../controllers/projectController.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// Middleware that accepts any project file fields ('image', 'images', 'brochure') and normalizes them into req.files
const projectUpload = (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (err) return next(err);
    if (Array.isArray(req.files)) {
      const filesObj = { image: [], images: [], brochure: [] };
      for (const file of req.files) {
        if (file.fieldname === 'brochure') {
          filesObj.brochure.push(file);
        } else if (file.fieldname === 'image') {
          filesObj.image.push(file);
          filesObj.images.push(file);
        } else {
          filesObj.images.push(file);
        }
      }
      req.files = filesObj;
    }
    next();
  });
};

// Routes
router.route('/')
  .get(getProjects)
  .post(projectUpload, createProject);

router.route('/status/ongoing')
  .get(getOngoingProjects);

router.route('/status/completed')
  .get(getCompletedProjects);

router.route('/:id')
  .get(getProjectById)
  .put(projectUpload, updateProject)
  .delete(deleteProject);

router.route('/:id/brochure')
  .get(getProjectBrochure);

router.route('/:id/status')
  .patch(updateProjectStatus);

export default router;
