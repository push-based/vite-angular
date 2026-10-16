import {bootstrapApplication} from '@angular/platform-browser';
import {App} from './app/app';
import {appConfig} from './app/app.config';
import './styles/tokens.css';
import './styles/components.css';
import './styles/site.css';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
