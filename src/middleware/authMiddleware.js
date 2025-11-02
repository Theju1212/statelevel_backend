import { verifyToken } from '../services/auth.js';
import User from '../models/User.js';
import { config } from '../config.js';  // CORRECT

export async function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header) {
        console.warn("[AuthMiddleware] No authorization header.");
        return res.status(401).json({ error: 'No token' });
    }

    const token = header.split(' ')[1];
    if (!token) {
        console.warn("[AuthMiddleware] Bearer token missing.");
        return res.status(401).json({ error: 'Invalid token' });
    }

    let payload;
    try {
        payload = verifyToken(token);
        if (!payload?.userId) {
            return res.status(401).json({ error: 'Invalid payload' });
        }
    } catch (err) {
        console.error("[AuthMiddleware] Token error:", err.message);
        return res.status(401).json({ error: 'Token expired or invalid' });
    }

    let user;
    try {
        user = await User.findById(payload.userId).lean();
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }
    } catch (err) {
        console.error("[AuthMiddleware] DB error:", err);
        return res.status(500).json({ error: 'Server error' });
    }

    const storeId = payload.storeId || 
      (user.storeIds?.length > 0 ? user.storeIds[0].toString() : null);

    req.user = {
        id: user._id.toString(),
        storeId,
        email: user.email,
        role: payload.role
    };
    req.role = payload.role;
    req.storeId = storeId;

    console.log(`[AuthMiddleware] Authenticated: ${req.user.id}, Role: ${req.role}, Store: ${req.storeId}`);

    if (!req.storeId) {
        console.error("[AuthMiddleware] No storeId! Payload:", payload, "User stores:", user.storeIds);
        return res.status(400).json({ error: 'No store linked to user' });
    }

    next();
}

export function requireRole(role) {
    return (req, res, next) => {
        if (req.role !== role) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        next();
    };
}