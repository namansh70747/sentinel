import React from 'react';
import {createRoot} from 'react-dom/client';
import {Showcase} from '../console/components/showcase';
createRoot(document.getElementById('root')!).render(<React.StrictMode><Showcase/></React.StrictMode>);
