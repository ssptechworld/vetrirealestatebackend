import mongoose from 'mongoose';

const gallerySchema = new mongoose.Schema(
  {
    projectName: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true
    },
    location: {
      type: String,
      default: '',
      trim: true
    },
    description: {
      type: String,
      default: '',
      trim: true
    },
    completionYear: {
      type: String,
      default: '',
      trim: true
    },
    mediaType: {
      type: String,
      required: [true, 'Media type is required'],
      enum: ['image', 'video'],
      default: 'image'
    },
    mediaUrl: {
      type: String,
      required: [true, 'Media URL is required']
    },
    cloudinaryPublicId: {
      type: String,
      default: ''
    },
    thumbnailUrl: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model('Gallery', gallerySchema);
