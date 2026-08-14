require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// KONEKSI DATABASE MONGODB
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://ikanbuntal142_db_user:ZmRVHO3ko8MbqB53@cluster0.yye1dud.mongodb.net/?appName=Cluster0";

if (mongoose.connection.readyState === 0) {
    mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
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
        
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Request Upgrade Pro (Kirim Antrean Pembayaran)
app.post('/api/user/request-pro', async (req, res) => {
    try {
        const { userId, paketDipilih, harga } = req.body;
        const payment = new Payment({ userId, paketDipilih, harga });
        await payment.save();
        res.json({ success: true, message: "Permintaan upgrade terkirim ke Admin!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ENDPOINT DEVELOPER / ADMIN ---

// 4. Ambil Semua User
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });
        res.json({ data: users });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Ambil Antrean Pembayaran
app.get('/api/admin/payments/pending', async (req, res) => {
    try {
        const payments = await Payment.find({ status: 'Pending' }).populate('userId');
        res.json({ data: payments });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. Setujui Pembayaran (Approve Pro)
app.post('/api/admin/payments/:id/approve', async (req, res) => {
    try {
        const payment = await Payment.findById(req.id || req.params.id);
        if (!payment) return res.status(404).json({ message: "Data tidak ditemukan" });

        let expiredDate = new Date();
        if (payment.paketDipilih === '1 Bulan') expiredDate.setDate(expiredDate.getDate() + 30);
        else if (payment.paketDipilih === '1 Tahun') expiredDate.setDate(expiredDate.getDate() + 365);
        else if (payment.paketDipilih === 'Permanen') expiredDate.setFullYear(expiredDate.getFullYear() + 99);

        await User.findByIdAndUpdate(payment.userId, {
            statusAkun: 'Pro',
            paketPro: payment.paketDipilih,
            berlakuHingga: expiredDate
        });

        payment.status = 'Approved';
        await payment.save();

        res.json({ success: true, message: "Pengguna berhasil di-upgrade ke Pro!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. Tolak Pembayaran
app.post('/api/admin/payments/:id/reject', async (req, res) => {
    try {
        await Payment.findByIdAndUpdate(req.params.id, { status: 'Rejected' });
        res.json({ success: true, message: "Pembayaran ditolak." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 8. Manual Switch Pro / Free oleh Admin
app.put('/api/admin/users/:userId/upgrade', async (req, res) => {
    try {
        const { statusAkun, paketPro } = req.body; // statusAkun = 'Pro' / 'Free'
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
