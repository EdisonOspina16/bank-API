import app from './app';
import { port } from './config/env';

app.listen(port, () => {
  console.log(`Bank API listening on port ${port}`);
});