import { createRouter, createWebHistory } from 'vue-router';
import WelcomePage from '../views/WelcomePage.vue';
import UploadPage from '../views/UploadPage.vue';
import ModelViewerPage from '../views/ModelViewerPage.vue';

const routes = [
  {
    path: '/',
    name: 'Welcome',
    component: WelcomePage
  },
  {
    path: '/upload',
    name: 'Upload',
    component: UploadPage
  },
  {
    path: '/model-viewer',
    name: 'ModelViewer',
    component: ModelViewerPage,
    props: route => ({
      timestamp: route.query.timestamp,
      organs: route.query.organs
    })
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;
