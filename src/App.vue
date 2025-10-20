<!-- <script setup></script>

<template>
  <router-view />
</template>

<style scoped>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
}
</style> -->
// In App.vue or another page
<template>
  <!-- <LocalModelViewer /> -->
   <ModelViewerPage />
</template>

<script setup>
import LocalModelViewer from './components/LocalModelViewer.vue';
import ModelViewerPage from './views/ModelViewerPage.vue';
</script>