import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../../../modules/auth/services/auth.service';

export class AuthController {
  private readonly authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, phoneCountry, phoneNumber, password, pin, firstName, lastName, docType, docNumber } = req.body;

      if (!email || !phoneCountry || !phoneNumber || !pin || !firstName || !lastName || !docType || !docNumber) {
        res.status(400).json({ error: 'Faltan campos obligatorios para el registro.' });
        return;
      }

      if (!/^\d{4}$/.test(pin)) {
        res.status(400).json({ error: 'El PIN debe ser exactamente de 4 dígitos numéricos.' });
        return;
      }

      const result = await this.authService.register({
        email,
        phoneCountry,
        phoneNumber,
        password,
        pin,
        firstName,
        lastName,
        docType,
        docNumber,
      });

      res.status(201).json({
        message: 'Usuario registrado exitosamente.',
        user: {
          id: result.user.id,
          email: result.user.email,
          phoneCountry,
          phoneNumber: result.user.phoneNumber,
          firstName,
          lastName,
          docType,
          docNumber,
        },
        tokens: result.tokens,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Error al registrar el usuario.' });
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { docType, docNumber, pin } = req.body;

      if (!docType || !docNumber || !pin) {
        res.status(400).json({ error: 'Faltan campos obligatorios: tipo de documento, número de documento y PIN.' });
        return;
      }

      if (!/^\d{4}$/.test(pin)) {
        res.status(400).json({ error: 'El PIN debe ser de 4 dígitos numéricos.' });
        return;
      }

      const result = await this.authService.loginWithPin(docType, docNumber, pin);

      res.status(200).json({
        message: 'Inicio de sesión exitoso.',
        tokens: result.tokens,
        user: {
          id: result.user.id,
          email: result.user.email,
          phoneCountry: result.user.phoneCountry,
          phoneNumber: result.user.phoneNumber,
          firstName: result.customerProfile.firstName,
          lastName: result.customerProfile.lastName,
          docType: result.customerProfile.docType,
          docNumber: result.customerProfile.docNumber,
        },
      });
    } catch (error: any) {
      res.status(401).json({ error: error.message || 'Credenciales inválidas.' });
    }
  };
}

export default AuthController;
