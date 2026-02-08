// @ts-nocheck
import * as THREE from 'three';
import {
  projectPerspective,
  intersectHyperplane,
  clamp,
} from '../core/math4d';
import { blendGraphChannel } from './colorThemeMath';
import { getGraphLabelDispatchIntervalMs } from './graphLabelDispatch';

const tempColor = new THREE.Color();
const tempVec = new THREE.Vector3();
const GRAPH_THEME_BLEND = 0.74;

const GRAPH_VERTEX_SHADER = `
  attribute float size;
  attribute float intensity;
  attribute vec3 hyperColor;
  varying vec3 vColor;
  varying float vIntensity;
  void main() {
    vColor = hyperColor;
    vIntensity = intensity;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float attenuation = size * (220.0 / max(0.0001, -mvPosition.z));
    gl_PointSize = clamp(attenuation, 1.0, 160.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const GRAPH_FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vIntensity;
  uniform float opacity;
  uniform float glow;
  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.55) discard;
    float halo = smoothstep(0.55, 0.28, dist);
    float core = smoothstep(0.32, 0.0, dist);
    float alpha = clamp(core + halo * glow, 0.0, 1.0) * opacity * clamp(vIntensity, 0.05, 1.35);
    vec3 tint = mix(vColor * 0.75, vColor, core);
    gl_FragColor = vec4(tint, alpha);
  }
`;

export class HyperRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    this.camera.position.set(0, 0, 5);
    this.scene.add(this.camera);

    this.object = null;
    this.theme = null;
    this.isGraph = false;
    this.graphMeta = null;
    this.graphLabelCallback = null;
    this.graphLabelPayload = null;
    this.lastGraphLabelPushAt = 0;
    this.lastGraphLabelFocusNode = null;
    this.lastGraphVertexVisibilityRef = null;
    this.lastGraphEdgeVisibilityRef = null;

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.45);
    keyLight.position.set(2, 3, 4);
    this.scene.add(keyLight);

    this.clock = new THREE.Clock();

    this.vertexCache3 = [];
    this.slicePointCount = 0;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  getGraphProjection() {
    return this.graphLabelPayload;
  }

  setGraphLabelCallback(callback) {
    this.graphLabelCallback = callback;
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.renderer.dispose();
  }

  resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
  }

  setObject(object) {
    this.object = object;
    this.isGraph = !!(object?.meta && object.meta.type === 'graph');
    this.graphMeta = this.isGraph ? object.meta : null;
    this.vertexCache3 = new Array(object.vertices.length).fill(null);
    this.lastGraphLabelPushAt = 0;
    this.lastGraphLabelFocusNode = null;
    this.lastGraphVertexVisibilityRef = null;
    this.lastGraphEdgeVisibilityRef = null;
    this._buildGeometry();
  }

  updateTheme(theme) {
    const fallback = {
      lineOpacity: 0.55,
      pointOpacity: 0.95,
      sliceOpacity: 0.95,
      shadowOpacity: 0.28,
    };
    const resolved = theme || fallback;
    this.theme = resolved;
    if (!this.lines) return;
    this.lineMaterial.opacity = resolved.lineOpacity;
    if (this.vertexMaterial.uniforms && this.vertexMaterial.uniforms.opacity) {
      this.vertexMaterial.uniforms.opacity.value = resolved.pointOpacity;
    } else if ('opacity' in this.vertexMaterial) {
      this.vertexMaterial.opacity = resolved.pointOpacity;
    }
    this.sliceMaterial.opacity = resolved.sliceOpacity;
    this.shadowMaterial.opacity = resolved.shadowOpacity;
  }

  _buildGeometry() {
    if (!this.object) return;

    const edgeCount = this.object.edges.length;
    const vertexCount = this.object.vertices.length;
    const isGraph = this.isGraph;

    if (this.lines) {
      this.scene.remove(this.lines);
      this.lineGeometry.dispose();
      this.lineMaterial.dispose();
    }

    this.lineGeometry = new THREE.BufferGeometry();
    this.lineGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(edgeCount * 2 * 3), 3),
    );
    this.lineGeometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(edgeCount * 2 * 3), 3),
    );
    this.lineMaterial = new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0.55,
      vertexColors: true,
      linewidth: 1,
    });
    this.lines = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
    this.lines.frustumCulled = false;
    this.scene.add(this.lines);

    if (this.vertexPoints) {
      this.scene.remove(this.vertexPoints);
      this.vertexGeometry.dispose();
      this.vertexMaterial.dispose();
    }
    this.vertexGeometry = new THREE.BufferGeometry();
    this.vertexGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3),
    );

    if (isGraph) {
      this.vertexGeometry.setAttribute(
        'hyperColor',
        new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3),
      );
      this.vertexGeometry.setAttribute(
        'size',
        new THREE.BufferAttribute(new Float32Array(vertexCount), 1),
      );
      this.vertexGeometry.setAttribute(
        'intensity',
        new THREE.BufferAttribute(new Float32Array(vertexCount), 1),
      );
    } else {
      this.vertexGeometry.setAttribute(
        'color',
        new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3),
      );
    }

    if (isGraph) {
      this.vertexMaterial = new THREE.ShaderMaterial({
        uniforms: {
          opacity: { value: 0.75 },
          glow: { value: 0.35 },
        },
        transparent: true,
        depthWrite: false,
        vertexColors: true,
        vertexShader: GRAPH_VERTEX_SHADER,
        fragmentShader: GRAPH_FRAGMENT_SHADER,
        blending: THREE.AdditiveBlending,
      });
    } else {
      this.vertexMaterial = new THREE.PointsMaterial({
        size: 0.35,
        sizeAttenuation: true,
        transparent: true,
        vertexColors: true,
        opacity: 0.9,
      });
    }
    this.vertexPoints = new THREE.Points(this.vertexGeometry, this.vertexMaterial);
    this.vertexPoints.frustumCulled = false;
    this.scene.add(this.vertexPoints);

    if (this.slicePoints) {
      this.scene.remove(this.slicePoints);
      this.sliceGeometry.dispose();
      this.sliceMaterial.dispose();
    }
    this.sliceGeometry = new THREE.BufferGeometry();
    this.sliceGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(edgeCount * 3), 3),
    );
    this.sliceGeometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(edgeCount * 3), 3),
    );
    this.sliceMaterial = new THREE.PointsMaterial({
      size: isGraph ? 0.11 : 0.09,
      sizeAttenuation: true,
      transparent: true,
      vertexColors: true,
      opacity: 1,
    });
    this.slicePoints = new THREE.Points(this.sliceGeometry, this.sliceMaterial);
    this.slicePoints.visible = false;
    this.slicePoints.frustumCulled = false;
    this.scene.add(this.slicePoints);

    if (this.shadowLines) {
      this.scene.remove(this.shadowLines);
      this.shadowGeometry.dispose();
      this.shadowMaterial.dispose();
    }
    this.shadowGeometry = new THREE.BufferGeometry();
    this.shadowGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(edgeCount * 2 * 3), 3),
    );
    this.shadowGeometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(edgeCount * 2 * 3), 3),
    );
    this.shadowMaterial = new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0.3,
      vertexColors: true,
      linewidth: 1,
    });
    this.shadowLines = new THREE.LineSegments(this.shadowGeometry, this.shadowMaterial);
    this.shadowLines.visible = false;
    this.shadowLines.frustumCulled = false;
    this.scene.add(this.shadowLines);

    if (this.theme) {
      this.updateTheme(this.theme);
    }
  }

  renderFrame({
    vertices4d,
    projection,
    sliceMode,
    sliceOffset,
    sliceThickness,
    theme,
    graphState,
  }) {
    if (!this.object) return;
    const isGraph = this.isGraph;
    const graphMeta = this.graphMeta;
    const time = this.clock.getElapsedTime();
    if (!isGraph) {
      if (!theme) theme = this.theme;
      if (theme && theme !== this.theme) {
        this.updateTheme(theme);
      }
    } else {
      if (theme && theme !== this.theme) {
        this.updateTheme(theme);
      }
      theme = this.theme;
      if (this.vertexMaterial.uniforms) {
        const uniforms = this.vertexMaterial.uniforms;
        if ('opacity' in uniforms && graphState?.pointOpacity !== undefined) {
          uniforms.opacity.value = graphState.pointOpacity;
        } else if ('opacity' in uniforms) {
          uniforms.opacity.value = 0.75;
        }
        if ('glow' in uniforms) {
          uniforms.glow.value = graphState?.glow ?? graphState?.glowStrength ?? 0.35;
        }
      }
    }

    const positions = this.lineGeometry.attributes.position.array;
    const colors = this.lineGeometry.attributes.color.array;
    const vertexPositions = this.vertexGeometry.attributes.position.array;
    const vertexColorAttr = this.vertexGeometry.getAttribute(this.isGraph ? 'hyperColor' : 'color');
    const vertexColors = vertexColorAttr ? vertexColorAttr.array : null;
    const sizeAttribute = this.vertexGeometry.getAttribute('size');
    const vertexSizes = sizeAttribute ? sizeAttribute.array : null;
    const intensityAttribute = this.vertexGeometry.getAttribute('intensity');
    const vertexIntensity = intensityAttribute ? intensityAttribute.array : null;
    const slicePositions = this.sliceGeometry.attributes.position.array;
    const sliceColors = this.sliceGeometry.attributes.color.array;
    const shadowPositions = this.shadowGeometry.attributes.position.array;
    const shadowColors = this.shadowGeometry.attributes.color.array;

    const graphShowLines = graphState?.showLinks ?? true;
    const showLines = isGraph ? graphShowLines : true;

    if (this.lines) {
      this.lines.visible = showLines;
    }

    let sliceCount = 0;

    const vertexCount = vertices4d.length;
    let wMin = Infinity;
    let wMax = -Infinity;

    for (let i = 0; i < vertexCount; i += 1) {
      const w = vertices4d[i][3];
      if (w < wMin) wMin = w;
      if (w > wMax) wMax = w;
    }
    const wRange = wMax - wMin || 1;

    const projected = this.vertexCache3;
    let depthMin = Infinity;
    let depthMax = -Infinity;

    for (let i = 0; i < vertexCount; i += 1) {
      const vec3 = projectPerspective(vertices4d[i], projection);
      projected[i] = vec3;
      vertexPositions[i * 3] = vec3[0];
      vertexPositions[i * 3 + 1] = vec3[1];
      vertexPositions[i * 3 + 2] = vec3[2];
      if (vec3[2] < depthMin) depthMin = vec3[2];
      if (vec3[2] > depthMax) depthMax = vec3[2];
    }
    const depthRange = depthMax - depthMin || 1;

    const vertexVisibility = isGraph && graphState?.vertexVisibility
      ? graphState.vertexVisibility
      : null;
    const focusStrength = graphState?.focusStrength ?? 0;
    const focusColor = graphState?.focusColor ?? null;

    const sliceBand = Math.max(0.0001, sliceThickness / 2);

    for (let i = 0; i < vertexCount; i += 1) {
      const vec4 = vertices4d[i];
      const vec3 = projected[i];
      const normW = (vec4[3] - wMin) / wRange;
      const depthNorm = (vec3[2] - depthMin) / depthRange;

      if (isGraph && graphMeta && vertexColors) {
        const baseIndex = i * 3;
        const baseColorR = graphMeta.vertexColors[baseIndex];
        const baseColorG = graphMeta.vertexColors[baseIndex + 1];
        const baseColorB = graphMeta.vertexColors[baseIndex + 2];
        const visibility = vertexVisibility ? vertexVisibility[i] : 1;
        const visibilityWeight = 0.2 + visibility * 0.8;
        let sliceWeight = 1;
        if (sliceMode === 'hyperplane') {
          const dist = Math.abs(vec4[3] - sliceOffset);
          const highlight = clamp(1 - dist / sliceBand, 0, 1);
          sliceWeight = highlight > 0 ? 0.25 + highlight * 0.75 : 0.18;
        }
        const isFocusNode = graphState?.focusNode === i;
        let finalWeight = visibilityWeight * sliceWeight;
        let sizeMultiplier = 1;
        let colorR = baseColorR;
        let colorG = baseColorG;
        let colorB = baseColorB;

        if (theme) {
          const themedNodeColor = theme.pointColor({ normW, depth: depthNorm });
          colorR = blendGraphChannel(colorR, themedNodeColor[0], GRAPH_THEME_BLEND);
          colorG = blendGraphChannel(colorG, themedNodeColor[1], GRAPH_THEME_BLEND);
          colorB = blendGraphChannel(colorB, themedNodeColor[2], GRAPH_THEME_BLEND);
        }

        if (isFocusNode) {
          const emphasis = clamp(focusStrength, 0, 1);
          const pulse = 0.6 + 0.4 * Math.sin(time * 1.25);
          finalWeight = Math.max(
            finalWeight,
            visibilityWeight * sliceWeight * (1 + emphasis * 0.8) + emphasis * 0.25,
          );
          sizeMultiplier = 1 + emphasis * 0.55 + (pulse - 0.6) * 0.3 * emphasis;
          if (focusColor) {
            colorR = baseColorR * (1 - emphasis) + focusColor[0] * emphasis;
            colorG = baseColorG * (1 - emphasis) + focusColor[1] * emphasis;
            colorB = baseColorB * (1 - emphasis) + focusColor[2] * emphasis;
          } else {
            const brighten = 1 + emphasis * 0.4;
            colorR *= brighten;
            colorG *= brighten;
            colorB *= brighten;
          }
          finalWeight *= 0.9 + pulse * 0.4 * emphasis;
        }

        vertexColors[baseIndex] = colorR * finalWeight;
        vertexColors[baseIndex + 1] = colorG * finalWeight;
        vertexColors[baseIndex + 2] = colorB * finalWeight;
        if (vertexSizes) {
          const baseSize = graphMeta.vertexSizes[i];
          const scale = graphState?.nodeScale ?? 1;
          const visibilityScale = Math.max(0.4, 0.6 + 0.4 * visibilityWeight);
          vertexSizes[i] = baseSize * scale * visibilityScale * sizeMultiplier;
        }
        if (vertexIntensity) {
          vertexIntensity[i] = Math.min(1.35, Math.max(0.08, finalWeight));
        }
      } else if (!isGraph && vertexColors) {
        const color = theme.pointColor({ normW, depth: depthNorm });
        vertexColors[i * 3] = color[0];
        vertexColors[i * 3 + 1] = color[1];
        vertexColors[i * 3 + 2] = color[2];
      }
    }

    const edgeVisibility = isGraph && graphState?.edgeVisibility
      ? graphState.edgeVisibility
      : null;

    const useSlice = sliceMode === 'hyperplane';
    const useShadow = sliceMode === 'shadow';

    let lineIndex = 0;
    let shadowIndex = 0;

    const graphLinks = isGraph ? graphMeta.links : null;
    if (isGraph) {
      this.graphLabelPayload = {
        positions: projected,
        labels: graphMeta.nodes,
        vertexVisibility,
        graphState,
      };
      if (this.graphLabelCallback) {
        const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now()
          : Date.now();
        const focusNode = graphState?.focusNode ?? null;
        const focusChanged = focusNode !== this.lastGraphLabelFocusNode;
        const vertexVisibilityChanged = vertexVisibility !== this.lastGraphVertexVisibilityRef;
        const edgeVisibilityChanged = edgeVisibility !== this.lastGraphEdgeVisibilityRef;
        const intervalMs = getGraphLabelDispatchIntervalMs(graphMeta.nodes.length);
        const elapsed = now - this.lastGraphLabelPushAt;
        if (focusChanged || vertexVisibilityChanged || edgeVisibilityChanged || elapsed >= intervalMs) {
          this.graphLabelCallback(this.graphLabelPayload);
          this.lastGraphLabelPushAt = now;
          this.lastGraphLabelFocusNode = focusNode;
          this.lastGraphVertexVisibilityRef = vertexVisibility;
          this.lastGraphEdgeVisibilityRef = edgeVisibility;
        }
      }
    } else {
      this.graphLabelPayload = null;
      this.lastGraphLabelPushAt = 0;
      this.lastGraphLabelFocusNode = null;
      this.lastGraphVertexVisibilityRef = null;
      this.lastGraphEdgeVisibilityRef = null;
    }

    const shouldRenderEdges = showLines || useSlice || useShadow;

    if (!shouldRenderEdges) {
      this.slicePointCount = 0;
      this.sliceGeometry.setDrawRange(0, 0);
      this.slicePoints.visible = false;
      this.shadowGeometry.setDrawRange(0, 0);
      this.shadowLines.visible = false;
      this.lineGeometry.setDrawRange(0, 0);
    } else {
      for (let i = 0; i < this.object.edges.length; i += 1) {
        const [aIndex, bIndex] = this.object.edges[i];
        const a4 = vertices4d[aIndex];
        const b4 = vertices4d[bIndex];
        const a3 = projected[aIndex];
        const b3 = projected[bIndex];

        const normWa = (a4[3] - wMin) / wRange;
        const normWb = (b4[3] - wMin) / wRange;
        const depthA = (a3[2] - depthMin) / depthRange;
        const depthB = (b3[2] - depthMin) / depthRange;

        if (showLines) {
          if (isGraph && graphLinks) {
            const link = graphLinks[i];
            const visible = edgeVisibility ? edgeVisibility[i] : 1;
            const weight = 0.25 + visible * 0.75;
            const base = lineIndex * 6;
            let colorAR = link.color[0];
            let colorAG = link.color[1];
            let colorAB = link.color[2];
            let colorBR = link.color[0];
            let colorBG = link.color[1];
            let colorBB = link.color[2];
            if (theme) {
              const themedLineA = theme.lineColor({ normW: normWa, depth: depthA });
              const themedLineB = theme.lineColor({ normW: normWb, depth: depthB });
              colorAR = blendGraphChannel(colorAR, themedLineA[0], GRAPH_THEME_BLEND);
              colorAG = blendGraphChannel(colorAG, themedLineA[1], GRAPH_THEME_BLEND);
              colorAB = blendGraphChannel(colorAB, themedLineA[2], GRAPH_THEME_BLEND);
              colorBR = blendGraphChannel(colorBR, themedLineB[0], GRAPH_THEME_BLEND);
              colorBG = blendGraphChannel(colorBG, themedLineB[1], GRAPH_THEME_BLEND);
              colorBB = blendGraphChannel(colorBB, themedLineB[2], GRAPH_THEME_BLEND);
            }
            tempColor.setRGB(colorAR * weight, colorAG * weight, colorAB * weight);
            positions[base] = a3[0];
            positions[base + 1] = a3[1];
            positions[base + 2] = a3[2];
            positions[base + 3] = b3[0];
            positions[base + 4] = b3[1];
            positions[base + 5] = b3[2];
            colors[base] = tempColor.r;
            colors[base + 1] = tempColor.g;
            colors[base + 2] = tempColor.b;
            colors[base + 3] = colorBR * weight;
            colors[base + 4] = colorBG * weight;
            colors[base + 5] = colorBB * weight;
          } else if (this.theme) {
            const colorA = this.theme.lineColor({ normW: normWa, depth: depthA });
            const colorB = this.theme.lineColor({ normW: normWb, depth: depthB });
            const base = lineIndex * 6;
            positions[base] = a3[0];
            positions[base + 1] = a3[1];
            positions[base + 2] = a3[2];
            positions[base + 3] = b3[0];
            positions[base + 4] = b3[1];
            positions[base + 5] = b3[2];
            colors[base] = colorA[0];
            colors[base + 1] = colorA[1];
            colors[base + 2] = colorA[2];
            colors[base + 3] = colorB[0];
            colors[base + 4] = colorB[1];
            colors[base + 5] = colorB[2];
          }
        }

        if (useSlice || useShadow) {
          const intersection = intersectHyperplane(a4, b4, 3, sliceOffset);
          if (intersection) {
            const vec3 = projectPerspective(intersection, projection);
            if (useSlice) {
              const base = sliceCount * 3;
              slicePositions[base] = vec3[0];
              slicePositions[base + 1] = vec3[1];
              slicePositions[base + 2] = vec3[2];
              if (this.theme) {
                const sliceColor = this.theme.sliceColor({
                  normW: (intersection[3] - wMin) / wRange,
                  depth: (vec3[2] - depthMin) / depthRange,
                });
                sliceColors[base] = sliceColor[0];
                sliceColors[base + 1] = sliceColor[1];
                sliceColors[base + 2] = sliceColor[2];
              }
              sliceCount += 1;
            }
            if (useShadow) {
              const shadowVec = [...intersection];
              shadowVec[3] = wMin - 0.12;
              const shadowProjected = projectPerspective(shadowVec, projection);
              const base = shadowIndex * 6;
              shadowPositions[base] = vec3[0];
              shadowPositions[base + 1] = vec3[1];
              shadowPositions[base + 2] = vec3[2];
              shadowPositions[base + 3] = shadowProjected[0];
              shadowPositions[base + 4] = shadowProjected[1];
              shadowPositions[base + 5] = shadowProjected[2];
              if (this.theme) {
                const shadowColor = this.theme.shadowColor({
                  normW: (intersection[3] - wMin) / wRange,
                  depth: (vec3[2] - depthMin) / depthRange,
                });
                shadowColors[base] = shadowColor[0];
                shadowColors[base + 1] = shadowColor[1];
                shadowColors[base + 2] = shadowColor[2];
                shadowColors[base + 3] = shadowColor[0];
                shadowColors[base + 4] = shadowColor[1];
                shadowColors[base + 5] = shadowColor[2];
              }
              shadowIndex += 1;
            }
          }
        }

        if (showLines) {
          lineIndex += 1;
        }
      }

      this.slicePointCount = sliceCount;

      this.sliceGeometry.setDrawRange(0, sliceCount);
      this.slicePoints.visible = useSlice && sliceCount > 0;

      this.shadowGeometry.setDrawRange(0, shadowIndex * 2);
      this.shadowLines.visible = showLines && useShadow && shadowIndex > 0;

      this.lineGeometry.setDrawRange(0, showLines ? lineIndex * 2 : 0);
    }

    this.lineGeometry.attributes.position.needsUpdate = true;
    this.lineGeometry.attributes.color.needsUpdate = true;
    this.vertexGeometry.attributes.position.needsUpdate = true;
    if (vertexColorAttr) {
      vertexColorAttr.needsUpdate = true;
    }
    if (sizeAttribute) {
      sizeAttribute.needsUpdate = true;
    }
    if (intensityAttribute) {
      intensityAttribute.needsUpdate = true;
    }
    this.sliceGeometry.attributes.position.needsUpdate = true;
    this.sliceGeometry.attributes.color.needsUpdate = true;
    this.shadowGeometry.attributes.position.needsUpdate = true;
    this.shadowGeometry.attributes.color.needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  }
}
