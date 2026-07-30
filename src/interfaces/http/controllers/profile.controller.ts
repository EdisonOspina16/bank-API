import { Request, Response } from 'express';
import { ProfileService } from '../../../modules/users/services/profile.service';

const profileService = new ProfileService();

export async function getProfile(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'No autenticado.' });
  }

  try {
    const profile = await profileService.getProfile(userId);
    return res.json({ profile });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error al obtener el perfil.' });
  }
}

export async function updateProfile(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'No autenticado.' });
  }

  const { nombre, telefono, ocupacion } = req.body;

  try {
    const updatedProfile = await profileService.updateProfile(userId, {
      nombre,
      telefono,
      ocupacion,
    });

    return res.json({
      message: 'Cambios guardados',
      profile: updatedProfile,
    });
  } catch (err: any) {
    if (err.validationErrors) {
      return res.status(400).json({
        error: 'Errores de validación',
        validationErrors: err.validationErrors,
      });
    }
    return res.status(500).json({ error: err.message || 'Error al actualizar el perfil.' });
  }
}

export async function changePassword(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'No autenticado.' });
  }

  const { password, pin } = req.body;

  if (password === undefined && pin === undefined) {
    return res.status(400).json({
      error: 'Debe proporcionar una contraseña o un PIN para actualizar.',
    });
  }

  try {
    await profileService.changePasswordOrPin(userId, { password, pin });
    return res.json({
      message: pin !== undefined ? 'PIN actualizado con éxito' : 'Contraseña actualizada con éxito',
    });
  } catch (err: any) {
    if (err.validationErrors) {
      return res.status(400).json({
        error: 'Errores de validación',
        validationErrors: err.validationErrors,
      });
    }
    return res.status(500).json({ error: err.message || 'Error al actualizar la contraseña o PIN.' });
  }
}

export default { getProfile, updateProfile, changePassword };
