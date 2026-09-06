import * as helpService from '../services/helpService.js';
import { AppError } from '../utils/AppError.js';

export const HELP_MESSAGE_MAX_LENGTH = 3000;

// POST /api/v1/help — send the logged-in user's message to the team.
// senderName comes exclusively from req.user.name (the verified JWT), never
// from the request body, so it can't be spoofed.
export async function sendHelp(req, res, next) {
  try {
    const { message } = req.body || {};
    const trimmed = typeof message === 'string' ? message.trim() : '';

    if (!trimmed) {
      throw new AppError('VALIDATION_ERROR', 'Message is required.', {
        status: 400,
        details: [{ field: 'message', issue: 'required' }],
      });
    }
    if (trimmed.length > HELP_MESSAGE_MAX_LENGTH) {
      throw new AppError('VALIDATION_ERROR', `Message must be ${HELP_MESSAGE_MAX_LENGTH} characters or fewer.`, {
        status: 400,
        details: [{ field: 'message', issue: `max ${HELP_MESSAGE_MAX_LENGTH} characters` }],
      });
    }

    await helpService.sendHelpRequest({ senderName: req.user.name, message: trimmed });
    res.status(200).json({ sent: true });
  } catch (err) {
    next(err);
  }
}
