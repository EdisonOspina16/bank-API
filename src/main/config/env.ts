const port = Number.parseInt(process.env.PORT ?? '5000', 10);
const apiCambioUrl = process.env.API_CAMBIO_URL_KEY ?? 'https://co.dolarapi.com';

export { port, apiCambioUrl };