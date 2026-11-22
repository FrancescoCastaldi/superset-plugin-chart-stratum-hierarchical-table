import { ControlPanelConfig } from '@superset-ui/chart-controls';
import datiSection from './dati';
import confrontoPeriodiSection from './confrontoPeriodi';
import formatoValoriSection from './formatoValori';
import totaliSection from './totali';
import aspettoSection from './aspetto';
import interazioneSection from './interazione';
import avanzateSection from './avanzate';

export { CUSTOM_D3_FORMAT_OPTIONS } from './helpers';

const config: ControlPanelConfig = {
  controlPanelSections: [
    datiSection,
    confrontoPeriodiSection,
    formatoValoriSection,
    totaliSection,
    aspettoSection,
    interazioneSection,
    avanzateSection,
  ],
};

export default config;
