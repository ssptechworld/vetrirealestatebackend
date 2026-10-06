import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true
    },
    location: {
      type: String,
      required: [true, 'Location is required'],
      trim: true
    },
    type: {
      type: String,
      required: [true, 'Project type is required'],
      enum: ['Apartment', 'Villa', 'Plot', 'Commercial', 'Other'],
      default: 'Apartment'
    },
    status: {
      type: String,
      required: [true, 'Project status is required'],
      enum: ['ongoing', 'completed'],
      default: 'ongoing'
    },
    price: {
      type: String,
      required: [true, 'Price is required'],
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    bedrooms: {
      type: String,
      default: '3 BHK'
    },
    area: {
      type: String,
      default: '1800 Sq.Ft'
    },
    completionDate: {
      type: String,
      default: ''
    },
    image: {
      type: String,
      required: [true, 'Project image is required']
    },
    images: [
      {
        type: String
      }
    ],
    public_id: {
      type: String,
      default: ''
    },
    featured: {
      type: Boolean,
      default: false
    },
    brochure: {
      data: Buffer,
      contentType: {
        type: String,
        default: 'application/pdf'
      },
      filename: {
        type: String,
        default: 'project-brochure.pdf'
      },
      size: {
        type: Number,
        default: 0
      }
    },
    hasBrochure: {
      type: Boolean,
      default: false
    },
    brochureUrl: {
      type: String,
      default: ''
    },
    brochure_public_id: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model('Project', projectSchema);
