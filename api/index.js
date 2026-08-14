if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// KONEKSI DATABASE MONGODB
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://ikanbuntal142_db_user:ZmRVHO3ko8MbqB53@cluster0.yye1dud.mongodb.net/?appName=Cluster0";

if (mongoose.connection.readyState === 0) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log("MongoDB Connected"))
        .catch(err => console.error("MongoDB Error:", err));
}

// SCHEMA USER
const UserSchema = new mongoose.Schema({
    nama: String,
    email: { type: String, unique: true, required: true },
    pass: String,
    statusAkun: { type: String, default: 'Free' }, // 'Free' atau 'Pro'
    paketPro: { type: String, default: 'Free' },  // '1 Bulan', '1 Tahun', 'Permanen'
    berlakuHingga: Date,
    createdAt: { type: Date, default: Date.now }
});

// SCHEMA PEMBAYARAN
const PaymentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    paketDipilih: String,
    harga: Number,
    status: { type: String, default: 'Pending' }, // 'Pending', 'Approved', 'Rejected'
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Payment = mongoose.models.Payment || mongoose.model('Payment', PaymentSchema);

// --- ENDPOINT PENGGUNA (USER) ---

// 1. Register User
app.post('/api/auth/register', async (req, res) => {
    try {
        const { nama, email, pass } = req.body;
        if (!email || !pass) return res.status(400).json({ message: "Email dan password wajib diisi!" });

        const exist = await User.findOne({ email });
        if (exist) return res.status(400).json({ message: "Email sudah terdaftar!" });

        const user = new User({ nama, email, pass });
        await user.save();
        res.json({ success: true, message: "Registrasi berhasil!", user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Login User
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, pass } = req.body;
        const user = await User.findOne({ email, pass });
        if (!user) return res.status(400).json({ message: "Email atau password salah!" });
        
        // Check pending payment
        const pendingPayment = await Payment.findOne({ userId: user._id, status: 'Pending' });
        const userObj = user.toObject();
        userObj.paymentPending = !!pendingPayment;

        res.json({ success: true, user: userObj });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Get User Status
app.get('/api/user/status', async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ message: "ID User tidak diberikan!" });

        const user = await User.findById(id);
        if (!user) return res.status(404).json({ message: "User tidak ditemukan!" });

        // Cek jika status Pro sudah kedaluwarsa
        if (user.statusAkun === 'Pro' && user.berlakuHingga && new Date() > new Date(user.berlakuHingga)) {
            user.statusAkun = 'Free';
            user.paketPro = 'Free';
            await user.save();
        }

        const pendingPayment = await Payment.findOne({ userId: user._id, status: 'Pending' });

        res.json({
            success: true,
            statusAkun: user.statusAkun,
            paketPro: user.paketPro,
            berlakuHingga: user.berlakuHingga,
            paymentPending: !!pendingPayment,
            user: { ...user.toObject(), paymentPending: !!pendingPayment }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Get User Profile
app.get('/api/user/profile', async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ message: "ID User tidak diberikan!" });

        const user = await User.findById(id);
        if (!user) return res.status(404).json({ message: "User tidak ditemukan!" });

        const pendingPayment = await Payment.findOne({ userId: user._id, status: 'Pending' });
        const userObj = user.toObject();
        userObj.paymentPending = !!pendingPayment;

        res.json({ success: true, user: userObj });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Check & Update Expired Pro Status & Pending Payments
app.post('/api/user/check-status', async (req, res) => {
    try {
        const { id, userId, email } = req.body;
        const searchId = id || userId;
        
        let user;
        if (searchId) {
            user = await User.findById(searchId);
        } else if (email) {
            user = await User.findOne({ email });
        }

        if (!user) return res.status(404).json({ message: "User tidak ditemukan!" });

        // Cek jika status Pro sudah melewati masa berlakuHingga
        if (user.statusAkun === 'Pro' && user.berlakuHingga && new Date() > new Date(user.berlakuHingga)) {
            user.statusAkun = 'Free';
            user.paketPro = 'Free';
            await user.save();
        }

        const pendingPayment = await Payment.findOne({ userId: user._id, status: 'Pending' });
        const userObj = user.toObject();
        userObj.paymentPending = !!pendingPayment;

        res.json({ success: true, user: userObj });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. Request Upgrade Pro (Kirim Antrean Pembayaran)
app.post('/api/user/request-pro', async (req, res) => {
    try {
        const { userId, paketDipilih, harga } = req.body;
        if (!userId) return res.status(400).json({ message: "ID User wajib diisi!" });

        const payment = new Payment({ userId, paketDipilih, harga });
        await payment.save();
        res.json({ success: true, message: "Permintaan upgrade terkirim ke Admin!", payment });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ENDPOINT DEVELOPER / ADMIN ---

// 7. Ambil Semua User
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find({}).sort({ createdAt: -1 }); 
        res.status(200).json(users);
    } catch (error) {
        console.error("Error get users:", error);
        res.status(500).json({ message: "Gagal mengambil data pengguna", error: error.message });
    }
});

// 8. Ambil Antrean Pembayaran
app.get('/api/admin/payments/pending', async (req, res) => {
    try {
        const payments = await Payment.find({ status: 'Pending' }).populate('userId');
        res.json({ data: payments });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 9. Setujui Pembayaran (Approve Pro)
app.post('/api/admin/payments/:id/approve', async (req, res) => {
    try {
        const paymentId = req.params.id;
        
        const payment = await Payment.findById(paymentId);
        if (!payment) {
            return res.status(404).json({ message: "Data pembayaran tidak ditemukan" });
        }

        payment.status = 'Approved';
        await payment.save();

        if (payment.userId) {
            let expiredDate = new Date();
            if (payment.paketDipilih === '1 Bulan') expiredDate.setDate(expiredDate.getDate() + 30);
            else if (payment.paketDipilih === '1 Tahun') expiredDate.setDate(expiredDate.getDate() + 365);
            else if (payment.paketDipilih === 'Permanen') expiredDate.setFullYear(expiredDate.getFullYear() + 99);

            await User.findByIdAndUpdate(payment.userId, {
                statusAkun: 'Pro',
                paketPro: payment.paketDipilih,
                berlakuHingga: expiredDate
            });
        }

        res.status(200).json({ message: "Pembayaran berhasil di-approve", payment });
    } catch (error) {
        console.error("Error approve payment:", error);
        res.status(500).json({ message: "Terjadi kesalahan pada server", error: error.message });
    }
});

// 10. Tolak Pembayaran
app.post('/api/admin/payments/:id/reject', async (req, res) => {
    try {
        await Payment.findByIdAndUpdate(req.params.id, { status: 'Rejected' });
        res.json({ success: true, message: "Pembayaran ditolak." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 11. Manual Switch Pro / Free oleh Admin
app.put('/api/admin/users/:userId/upgrade', async (req, res) => {
    try {
        const { statusAkun, paketPro } = req.body;
        let expiredDate = null;

        if (statusAkun === 'Pro') {
            expiredDate = new Date();
            if (paketPro === '1 Bulan') expiredDate.setDate(expiredDate.getDate() + 30);
            else if (paketPro === '1 Tahun') expiredDate.setDate(expiredDate.getDate() + 365);
            else if (paketPro === 'Permanen') expiredDate.setFullYear(expiredDate.getFullYear() + 99);
        }

        const user = await User.findByIdAndUpdate(req.params.userId, {
            statusAkun,
            paketPro: statusAkun === 'Pro' ? paketPro : 'Free',
            berlakuHingga: expiredDate
        }, { new: true });

        res.json({ success: true, message: `Status pengguna berhasil diubah ke ${statusAkun}!`, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = app;
