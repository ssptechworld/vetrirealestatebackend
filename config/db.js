import mongoose from 'mongoose';

export const connectDB = async () => {
  // Catch runtime connection errors so they don't terminate the process
  mongoose.connection.on('error', (err) => {
    console.error(`MongoDB Runtime Connection Error: ${err.message}`);
  });

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vetrirealestate', {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    // Do not crash the entire process if DB is temporarily unreachable
  }
};
