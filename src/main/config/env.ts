const port = Number.parseInt(process.env.PORT ?? '5000', 10);
const apiCambioUrl = process.env.API_CAMBIO_URL_KEY;

const trmHistoricalApiUrl =
  process.env.TRM_HISTORICAL_API_KEY?.includes('32sa-8pi3') ||
  process.env.TRM_HISTORICAL_API_KEY?.includes('datos.gov.co/resource')
    ? process.env.TRM_HISTORICAL_API_KEY.startsWith('http')
      ? process.env.TRM_HISTORICAL_API_KEY
      : apiCambioUrl
        ? `${apiCambioUrl}?$order=vigenciadesde DESC&$limit=30`
        : undefined
    : apiCambioUrl
      ? `${apiCambioUrl}?$order=vigenciadesde DESC&$limit=30`
      : undefined;

export { port, apiCambioUrl, trmHistoricalApiUrl };