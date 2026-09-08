import express from 'express';
import {
  createProject,
  getProjects,
  getOngoingProjects,
  getCompletedProjects,
  getProjectById,
  updateProject,
  deleteProject,
  updateProjectStatus
} from '../controllers/projectController.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// Routes
router.route('/')
  .get(getProjects)
  .post(upload.single('image'), createProject);

router.route('/status/ongoing')
  .get(getOngoingProjects);

router.route('/status/completed')
  .get(getCompletedProjects);

router.route('/:id')
  .get(getProjectById)
  .put(upload.single('image'), updateProject)
  .delete(deleteProject);

router.route('/:id/status')
  .patch(updateProjectStatus);

export default router;
