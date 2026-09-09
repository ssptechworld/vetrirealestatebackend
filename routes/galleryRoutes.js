import express from 'express';
import {
  getGalleryItems,
  getGalleryItemById,
  uploadGalleryMedia,
  updateGalleryItem,
  deleteGalleryItem,
  deleteGalleryProject
} from '../controllers/galleryController.js';
import { galleryUpload } from '../middleware/galleryUpload.js';

const router = express.Router();

// Routes
router.route('/')
  .get(getGalleryItems)
  .post(galleryUpload.array('mediaFiles', 20), uploadGalleryMedia);

router.route('/project/:projectName')
  .delete(deleteGalleryProject);

router.route('/:id')
  .get(getGalleryItemById)
  .put(updateGalleryItem)
  .delete(deleteGalleryItem);

export default router;
