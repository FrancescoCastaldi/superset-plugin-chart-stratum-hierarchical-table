declare module '@superset-ui/chart-controls' {
  export const sharedControls: Record<string, any>;
  export const D3_FORMAT_OPTIONS: [string, string][];
  export const ControlHeader: import('react').ComponentType<any>;
  export interface ControlPanelConfig {
    controlPanelSections: any[];
    [key: string]: any;
  }
}

declare module '*.png' {
  const value: string;
  export default value;
}

declare module '*.css';

