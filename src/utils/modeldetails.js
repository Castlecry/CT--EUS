// 模型详情功能工具函数

/**
 * 预设颜色列表
 */
export const presetColors = [
  { name: '黑色', hex: '#000000', rgb: { r: 0, g: 0, b: 0 } },
  { name: '深灰色', hex: '#333333', rgb: { r: 51, g: 51, b: 51 } },
  { name: '灰色', hex: '#666666', rgb: { r: 102, g: 102, b: 102 } },
  { name: '浅灰色', hex: '#999999', rgb: { r: 153, g: 153, b: 153 } },
  { name: '红色', hex: '#FF0000', rgb: { r: 255, g: 0, b: 0 } },
  { name: '橙色', hex: '#FF7F00', rgb: { r: 255, g: 127, b: 0 } },
  { name: '黄色', hex: '#FFFF00', rgb: { r: 255, g: 255, b: 0 } },
  { name: '绿色', hex: '#00FF00', rgb: { r: 0, g: 255, b: 0 } },
  { name: '蓝色', hex: '#0000FF', rgb: { r: 0, g: 0, b: 255 } },
  { name: '紫色', hex: '#800080', rgb: { r: 128, g: 0, b: 128 } },
  // 淡颜色系列
  { name: '淡红色', hex: '#FFCCCC', rgb: { r: 255, g: 204, b: 204 } },
  { name: '淡橙色', hex: '#FFE5CC', rgb: { r: 255, g: 229, b: 204 } },
  { name: '淡黄色', hex: '#FFFFCC', rgb: { r: 255, g: 255, b: 204 } },
  { name: '淡绿色', hex: '#CCFFCC', rgb: { r: 204, g: 255, b: 204 } },
  { name: '淡蓝色', hex: '#CCE5FF', rgb: { r: 204, g: 229, b: 255 } },
  { name: '淡紫色', hex: '#E5CCFF', rgb: { r: 229, g: 204, b: 255 } }
];

/**
 * RGB转换为HEX颜色值
 * @param {Object} rgb - RGB颜色对象 {r, g, b}
 * @returns {string} HEX颜色值
 */
export const rgbToHex = (rgb) => {
  const { r, g, b } = rgb;
  const toHex = (c) => {
    const hex = c.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
};

/**
 * HEX转换为RGB颜色值
 * @param {string} hex - HEX颜色值
 * @returns {Object} RGB颜色对象 {r, g, b}
 */
export const hexToRgb = (hex) => {
  // 移除#号
  hex = hex.replace(/^#/, '');
  
  // 解析HEX值
  const bigint = parseInt(hex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  
  return { r, g, b };
};

/**
 * 验证RGB值是否有效
 * @param {Object} rgb - RGB颜色对象 {r, g, b}
 * @returns {boolean} 是否有效
 */
export const isValidRgb = (rgb) => {
  const { r, g, b } = rgb;
  return (
    typeof r === 'number' && r >= 0 && r <= 255 &&
    typeof g === 'number' && g >= 0 && g <= 255 &&
    typeof b === 'number' && b >= 0 && b <= 255
  );
};

/**
 * 应用模型颜色
 * @param {Object} renderer - 模型渲染器实例
 * @param {string} modelName - 模型名称
 * @param {Object} rgb - RGB颜色值
 */
export const applyModelColor = (renderer, modelName, rgb) => {
  if (!renderer || !renderer.changeModelColor || !isValidRgb(rgb)) {
    console.error('无效的渲染器或颜色值');
    return false;
  }
  
  try {
    renderer.changeModelColor(modelName, rgb);
    return true;
  } catch (error) {
    console.error('应用颜色失败:', error);
    return false;
  }
};

/**
 * 切换模型显示/隐藏
 * @param {Object} renderer - 模型渲染器实例
 * @param {string} modelName - 模型名称
 * @param {boolean} isVisible - 是否可见
 */
export const toggleModelVisibility = (renderer, modelName, isVisible) => {
  if (!renderer || !renderer.toggleModelVisibility) {
    console.error('无效的渲染器');
    return false;
  }
  
  try {
    renderer.toggleModelVisibility(modelName, isVisible);
    return true;
  } catch (error) {
    console.error('切换模型可见性失败:', error);
    return false;
  }
};

/**
 * 获取模型当前颜色
 * @param {Object} renderer - 模型渲染器实例
 * @param {string} modelName - 模型名称
 * @returns {Object|null} RGB颜色值或null
 */
export const getModelColor = (renderer, modelName) => {
  if (!renderer || !renderer.getModelColor) {
    console.error('无效的渲染器');
    return null;
  }
  
  try {
    return renderer.getModelColor(modelName);
  } catch (error) {
    console.error('获取模型颜色失败:', error);
    return null;
  }
};

/**
 * 获取模型当前可见性
 * @param {Object} renderer - 模型渲染器实例
 * @param {string} modelName - 模型名称
 * @returns {boolean|null} 可见性状态或null
 */
export const getModelVisibility = (renderer, modelName) => {
  if (!renderer || !renderer.getModelVisibility) {
    console.error('无效的渲染器');
    return null;
  }
  
  try {
    return renderer.getModelVisibility(modelName);
  } catch (error) {
    console.error('获取模型可见性失败:', error);
    return null;
  }
};