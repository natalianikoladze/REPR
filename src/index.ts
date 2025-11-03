import { GUI } from 'dat.gui';
import { mat4, vec3 } from 'gl-matrix';
import { Camera } from './camera';
import { SphereGeometry } from './geometries/sphere';
import { GLContext } from './gl';
import { PBRShader } from './shader/pbr-shader';
import { Texture, Texture2D } from './textures/texture';
import { UniformType } from './types';
import { PointLight, PonctualLight } from './lights/lights';
import { PlaneGeometry } from './geometries/plane';

// GUI elements
interface GUIProperties {
  albedo: number[];
  ibl: boolean;
}

/**
 * Class representing the current application with its state.
 *
 * @class Application
 */
class Application {
  private _context: GLContext; // Context used to draw to the canvas
  private _shader: PBRShader;
  private _geometry: SphereGeometry;
  private _quad: PlaneGeometry;
  private _uniforms: Record<string, UniformType | Texture>;
  private _textureDiffuse: Texture2D<HTMLElement> | null;
  private _textureSpecular: Texture2D<HTMLElement> | null;
  private _texturePreInt: Texture2D<HTMLElement> | null;
  private _camera: Camera;
  private _guiProperties: GUIProperties; // Object updated with the properties from the GUI
  private _lights: PointLight[];
  private _nbLights: number;


  constructor(canvas: HTMLCanvasElement) {
    this._context = new GLContext(canvas);
    this._camera = new Camera(0.0, 0.0, 18.0);
    this._geometry = new SphereGeometry();
    this._quad = new PlaneGeometry(canvas.width, canvas.height);
    this._shader = new PBRShader();
    this._textureDiffuse = null;
    this._textureSpecular = null;
    this._texturePreInt = null;
    this._lights = [];
    this._nbLights = 3;
    this._uniforms = {
      'uMaterial.albedo': vec3.create(),
      'uModel.LS_to_WS': mat4.create(),
      'uCamera.WS_to_CS': mat4.create(),
      'uCamera.position': this._camera._position,
    };

    // Set GUI default values
    this._guiProperties = {
      albedo: [255, 255, 255],
      ibl: false,
    };
    // Creates a GUI floating on the upper right side of the page.
    // You are free to do whatever you want with this GUI.
    // It's useful to have parameters you can dynamically change to see what happens.
    const gui = new GUI();
    gui.addColor(this._guiProperties, 'albedo');
    gui.add(this._guiProperties, 'ibl');
  }

  addPointLight(position: vec3, color: vec3, intensity: number) {
    let pointLight = new PointLight();
    pointLight.setPosition(position[0], position[1], position[2]);
    pointLight.setColorRGB(color[0], color[1], color[2]);
    pointLight.setIntensity(intensity);
    this._lights.push(pointLight);
  }

  /**
   * Initializes the application.
   */
  async init() {
    this._context.uploadGeometry(this._geometry);
    this._context.compileProgram(this._shader);

    // Example showing how to load a texture and upload it to GPU.
    this._textureDiffuse = await Texture2D.load('assets/env/Alexs_Apt_2k-diffuse-RGBM.png');
    if (this._textureDiffuse !== null) {
      this._uniforms['uTextureDiffuse'] = this._textureDiffuse;
      this._context.uploadTexture(this._textureDiffuse);
      // You can then use it directly as a uniform:
      // ```uniforms.myTexture = this._textureExample;```
    }
    this._textureSpecular = await Texture2D.load('assets/env/Alexs_Apt_2k-specular-RGBM.png');
    if (this._textureSpecular !== null) {
      this._uniforms['uTextureSpecular'] = this._textureSpecular;
      this._context.uploadTexture(this._textureSpecular);
      // You can then use it directly as a uniform:
      // ```uniforms.myTexture = this._textureExample;```
    }
    this._texturePreInt = await Texture2D.load('assets/ggx-brdf-integrated.png');
    if (this._texturePreInt !== null) {
      this._uniforms['uTexturePreInt'] = this._texturePreInt;
      this._context.uploadTexture(this._texturePreInt);
      // You can then use it directly as a uniform:
      // ```uniforms.myTexture = this._textureExample;```
    }

    // Set lights.
    this.addPointLight(vec3.fromValues(25.0, 25.0, 25.0), vec3.fromValues(255.0, 255.0, 255.0), 100.0);
    this.addPointLight(vec3.fromValues(25.0, -50.0, 25.0), vec3.fromValues(255.0, 255.0, 255.0), 100.0);
    this.addPointLight(vec3.fromValues(-25.0, 0.0, 25.0), vec3.fromValues(255.0, 255.0, 255.0), 100.0);
    this.addPointLight(vec3.fromValues(-25.0, -50.0, 25.0), vec3.fromValues(255.0, 255.0, 255.0), 100.0);

    this._nbLights = this._lights.length;
    this._uniforms['NB_LIGHTS'] = this._lights.length;

    for (let l = 0; l < this._nbLights; ++l) {
      this._uniforms['uLights[' + l + '].color'] = this._lights[l].color;
      this._uniforms['uLights[' + l + '].position'] = this._lights[l].positionWS;
      this._uniforms['uLights[' + l + '].intensity'] = this._lights[l].intensity;
    }

    // Handle keyboard and mouse inputs to translate and rotate camera.
    canvas.addEventListener('keydown', this._camera.onKeyDown.bind(this._camera), true);
    canvas.addEventListener('pointerdown', this._camera.onPointerDown.bind(this._camera), true);
    canvas.addEventListener('pointermove', this._camera.onPointerMove.bind(this._camera), true);
    canvas.addEventListener('pointerup', this._camera.onPointerUp.bind(this._camera), true);
    canvas.addEventListener('pointerleave', this._camera.onPointerUp.bind(this._camera), true);
  }

  /**
   * Called at every loop, before the [[Application.render]] method.
   */
  update() {
    /** Empty. */
  }

  /**
   * Called when the canvas size changes.
   */
  resize() {
    this._context.resetViewport();
  }

  /**
   * Called at every loop, after the [[Application.update]] method.
   */
  render() {
    this._context.clear();
    this._context.setDepthTest(true);

    const props = this._guiProperties;

    // Set the albedo uniform using the GUI value
    this._uniforms['uMaterial.albedo'] = vec3.fromValues(
      props.albedo[0] / 255,
      props.albedo[1] / 255,
      props.albedo[2] / 255);

    this._uniforms['ibl'] = props.ibl;

    // Set World-Space to Clip-Space transformation matrix (a.k.a view-projection).
    const aspect = this._context.gl.drawingBufferWidth / this._context.gl.drawingBufferHeight;
    let WS_to_CS = this._uniforms['uCamera.WS_to_CS'] as mat4;
    mat4.multiply(WS_to_CS, this._camera.computeProjection(aspect), this._camera.computeView());

    // Draw the 5x5 grid of spheres
    const rows = 5;
    const columns = 5;
    const spacing = this._geometry.radius * 2.5;
    for (let r = 0; r < rows; ++r) {
      for (let c = 0; c < columns; ++c) {
        this._uniforms['uMaterial.roughness'] = c / columns;
        this._uniforms['uMaterial.metallic'] = r / rows;
        // Set Local-Space to World-Space transformation matrix (a.k.a model).
        const WsSphereTranslation = vec3.fromValues(
          (c - columns * 0.5) * spacing + spacing * 0.5,
          (r - rows * 0.5) * spacing + spacing * 0.5,
          0.0
        );
        const LS_to_WS = this._uniforms["uModel.LS_to_WS"] as mat4;
        mat4.fromTranslation(LS_to_WS, WsSphereTranslation);

        // Draw the triangles
        this._context.draw(this._geometry, this._shader, this._uniforms);
      }
    }
  }
}

const canvas = document.getElementById('main-canvas') as HTMLCanvasElement;
const app = new Application(canvas as HTMLCanvasElement);
app.init();

function animate() {
  app.update();
  app.render();
  window.requestAnimationFrame(animate);
}
animate();

/**
 * Handles resize.
 */
const resizeObserver = new ResizeObserver((entries) => {
  if (entries.length > 0) {
    const entry = entries[0];
    canvas.width = window.devicePixelRatio * entry.contentRect.width;
    canvas.height = window.devicePixelRatio * entry.contentRect.height;
    app.resize();
  }
});

resizeObserver.observe(canvas);
