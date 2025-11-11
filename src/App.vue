<script setup>
import ModelViewerPage from './views/ModelViewerPage.vue';
</script>

<template>
  <!-- <router-view /> -->
  <ModelViewerPage />
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
}

#app {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>