import { app } from './app';
import { config } from './config';

app.listen(config.PORT, () => {
    console.log(`TaskTide API listening on port ${config.PORT}`);
});
