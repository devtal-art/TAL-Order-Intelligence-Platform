import { createTheme } from '@mui/material/styles';

// Scoped MUI theme for the dashboard redesign (V5) — maps MUI's palette onto
// the app's EXISTING design tokens (src/styles/base.css) instead of
// introducing a second, competing color system. Only ever mounted around the
// Dashboard page subtree (see pages/Dashboard.jsx) — deliberately not
// app-wide, and deliberately no <CssBaseline/>, so nothing outside the
// dashboard is affected by this theme.
export const dashboardMuiTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#2F4FA2', dark: '#27428C', light: '#EDF2FA', contrastText: '#fff' },
    success: { main: '#059669', dark: '#047857', light: '#ECFDF3' },
    warning: { main: '#F79009', dark: '#B54708', light: '#FFFAEB' },
    error: { main: '#D92D20', dark: '#B42318', light: '#FEF3F2' },
    text: { primary: '#1C1917', secondary: '#57534E', disabled: '#A8A29E' },
    divider: '#E9E7E3',
    background: { paper: '#FFFFFF', default: '#F5F5F3' },
  },
  typography: {
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 700 } } },
    MuiTableCell: { styleOverrides: { root: { borderColor: '#E9E7E3' } } },
    MuiAccordion: {
      styleOverrides: {
        root: {
          '&:before': { display: 'none' },
          boxShadow: 'none',
        },
      },
    },
    MuiButtonBase: { defaultProps: { disableRipple: false } },
  },
});
