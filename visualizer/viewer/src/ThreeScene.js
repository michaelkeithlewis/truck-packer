import * as THREE from "three";
import React, { Component } from "react";
import { Stats } from "stats-js";
import { Color } from "three";
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry';
import { MemoryColorScheme, CategoryColorScheme, StackPlacement, Box, Container, Point, StackableRenderer } from "./api";
import { http } from "./utils";
import { Font } from 'three/examples/jsm/loaders/FontLoader';

import randomColor from "randomcolor";
import { thisExpression } from "@babel/types";

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"

const helvetiker = require( 'three/examples/fonts/droid/droid_sans_mono_regular.typeface.json');

const DEFAULT_CONTAINERS = "./assets/containers.json";

const ANGULAR_VELOCITY = 0.01;

const GRID_SPACING = 10;
const DOCK_GAP = 60;
const LABEL_SIZE = 5;

var camera;
var orbit; // light orbit
var mainGroup;
var boxesGroup;
var controls;
var delta = 0;
var visibleContainers;
var shouldAnimate = false

const pointer = new THREE.Vector2();
var raycaster;
var INTERSECTED;
var stepNumber = -1;
var pointNumber = -1;


var maxPointNumbers;
var maxStepNumber = 0;
var minStepNumber = 0;

var points = false;

var stackableRenderer = new StackableRenderer();
var memoryScheme = new MemoryColorScheme(new CategoryColorScheme());

var gridXZ;

const font = new Font( helvetiker );

/**
 * Example temnplate of using Three with React
 */
class ThreeScene extends Component {
  constructor(props) {
    super(props);
    this.state = { useWireFrame: false, selectedBox: null };
    visibleContainers = new Array();
  }

  animate = () => {
    //update Orbit Of Camera
    controls.update();

    //Animate rotation of light
    if (orbit) orbit.rotation.z += ANGULAR_VELOCITY;

    // Update Uniform of shader
    delta += 0.01;
    //Direct manipulation
    //shaderMaterial.uniforms.delta.value = 0.5 + Math.sin(delta) * 0.0005;
    //shaderMesh.material.uniforms.u_time.value = delta;

    this.handleIntersection();

    //Redraw scene
    this.renderScene();
    this.frameId = window.requestAnimationFrame(this.animate);
  };

  // Helper function to fit camera to an object
  fitCameraToObject = (camera, controls, object, offset = 1.0) => {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= offset;

    camera.position.set(center.x - cameraZ, center.y + cameraZ * 0.6, center.z - cameraZ);
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();
  };

  componentDidMount() {
    //Add Light & nCamera
    this.addScene();

    // // Add Box Mesh with shader as texture
    this.addModels();

    // Add Events
    window.addEventListener("resize", this.onWindowResize, false);
    document.addEventListener("keyup", this.onDocumentKeyUp, false);
    document.addEventListener("keydown", this.onDocumentKeyDown, false);
    document.addEventListener("mousemove", this.onDocumentMouseMove, false);
    document.addEventListener("click", this.onDocumentClick, false);
    document.addEventListener("contextmenu", this.onDocumentRightClick, false);

    //--------START ANIMATION-----------
    this.renderScene();
    this.start();
  }

  handleIntersection = () => {
    raycaster.setFromCamera( pointer, camera );
    
    var target = null;
    for(var i = 0; i < visibleContainers.length; i++) {
      for(var k = 0; k < visibleContainers[i].children.length; k++) {
        var intersects = raycaster.intersectObjects(visibleContainers[i].children[k].children, true );
        if ( intersects.length > 0 ) {
          target = intersects[ 0 ].object;
        }
      }
    }

    if(target) {
      if ( INTERSECTED != target) {
        if ( INTERSECTED ) {
          INTERSECTED.material.emissive = new Color("#000000");

        }
        INTERSECTED = target
        INTERSECTED.myColor = INTERSECTED.material.color;
        INTERSECTED.material.emissive = new Color("#FF0000") 
      }
    } else {
      if ( INTERSECTED ) {
        INTERSECTED.material.emissive = new Color("#000000") ;
        INTERSECTED = null;
      }
    }
  };

  handleStepNumber = () => {
      console.log("Show step number " + stepNumber);
      
      for(var i = 0; i < visibleContainers.length; i++) {
        var visibleContainer = visibleContainers[i];
        
        var visibleContainerUserData = visibleContainer.userData;
        visibleContainer.visible = visibleContainerUserData.step < stepNumber;

		// adding alle the points is too expensive
		// so add for a single step at a time 
        stackableRenderer.removePoints(visibleContainer);
        if(points) {
        	stackableRenderer.addPoints(visibleContainer, memoryScheme, stepNumber, pointNumber);
        }
        
        for(var k = 0; k < visibleContainers[i].children.length; k++) {

          var container = visibleContainers[i].children[k];
          var containerUserData = container.userData;
          
          container.visible = containerUserData.step < stepNumber;
          
          var stackables = container.children;
          for(var j = 0; j < stackables.length; j++) {
            var stackable = stackables[j];
            var userData = stackables[j].userData;
            
            if(userData.type == "box") {
                stackable.visible = userData.step < stepNumber;
            }
          }
        }          
    }
  };

  addModels = () => {

    // parent group to hold models
    mainGroup = new THREE.Object3D();

    boxesGroup = new THREE.Group();
    mainGroup.add(boxesGroup);

    this.scene.add(mainGroup);
    
    let scene = this.scene;
    
    var latestData = null;

    var load = function(packaging) {

      var data = JSON.stringify(packaging);
      if(latestData != null && data == latestData) {
        return;
      }
      console.log("Update model");

      latestData = data;

      for(var i = 0; i < visibleContainers.length; i++) {
        mainGroup.remove(visibleContainers[i]);
      }

      var yOffset = 0;

      var minStep = -1;
      var maxStep = -1;
      
      var totalWidth = 0;
      var maxLength = 0;
      var maxHeight = 0;

      maxPointNumbers = new Array();
  
      for(var i = 0; i < packaging.containers.length; i++) {
        var containerJson = packaging.containers[i];
  
        var container = new Container(containerJson.name, containerJson.id, containerJson.step, containerJson.dx, containerJson.dy, containerJson.dz, containerJson.loadDx, containerJson.loadDy, containerJson.loadDz);
    
        if(container.step < minStep || minStep == -1) {
          minStep = container.step;
        }

        if(container.step > maxStep || maxStep == -1) {
          maxStep = container.step;
        }

        for(var j = 0; j < containerJson.stack.placements.length; j++) {
          var placement = containerJson.stack.placements[j];
          var stackable = placement.stackable;

          if(stackable.step < minStep || minStep == -1) {
            minStep = stackable.step;
          }
  
          if(stackable.step > maxStep || maxStep == -1) {
            maxStep = stackable.step;
          }
          
          var points = new Array();
          
          for(var l = 0; l < placement.points.length; l++) {
                var point = placement.points[l];
                points.push(new Point(point.x, point.y, point.z, point.dx, point.dy, point.dz));
          }

          if(maxPointNumbers[stackable.step] == null || maxPointNumbers[stackable.step] < points.length) {
            maxPointNumbers[stackable.step] = points.length;
          }

          if(stackable.type == "box") {
            var box = new Box(stackable.name, stackable.id, stackable.step, stackable.dx, stackable.dy, stackable.dz);
            container.add(new StackPlacement(box, placement.step, placement.x, placement.y, placement.z, points));
          }
        }

        maxStepNumber = maxStep + 1;
        minStepNumber = minStep;
        pointNumber = -1;
        stepNumber = maxStepNumber;

        var visibleContainer = stackableRenderer.add(boxesGroup, memoryScheme, new StackPlacement(container, 0, 0, yOffset, 0), 0, 0, 0);
        visibleContainers.push(visibleContainer);

        // --- Labels for this container ---
        var labelMat = new THREE.MeshPhongMaterial({ color: 0xffffff });

        // "TRUCK N" label above center
        var truckLabelGeo = new TextGeometry('TRUCK ' + (i + 1), {
          font: font, size: LABEL_SIZE, depth: 0, curveSegments: 1,
          bevelEnabled: false
        });
        truckLabelGeo.computeBoundingBox();
        var truckLabelW = truckLabelGeo.boundingBox.max.x - truckLabelGeo.boundingBox.min.x;
        var truckLabel = new THREE.Mesh(truckLabelGeo, labelMat);
        truckLabel.position.set(
          yOffset + container.dy / 2 - truckLabelW / 2,
          container.dz + LABEL_SIZE * 2,
          container.dx / 2
        );
        truckLabel.rotation.x = -Math.PI / 2;
        scene.add(truckLabel);

        // "CAB" label at x=0 end (Three.js Z=0 side)
        var cabGeo = new TextGeometry('CAB', {
          font: font, size: LABEL_SIZE * 0.7, depth: 0, curveSegments: 1,
          bevelEnabled: false
        });
        cabGeo.computeBoundingBox();
        var cabW = cabGeo.boundingBox.max.x - cabGeo.boundingBox.min.x;
        var cabLabel = new THREE.Mesh(cabGeo, labelMat);
        cabLabel.position.set(
          yOffset + container.dy / 2 - cabW / 2,
          -LABEL_SIZE,
          -LABEL_SIZE * 2
        );
        cabLabel.rotation.x = -Math.PI / 2;
        scene.add(cabLabel);

        // "DOOR" label at x=dx end (Three.js Z=dx side)
        var doorGeo = new TextGeometry('DOOR', {
          font: font, size: LABEL_SIZE * 0.7, depth: 0, curveSegments: 1,
          bevelEnabled: false
        });
        doorGeo.computeBoundingBox();
        var doorW = doorGeo.boundingBox.max.x - doorGeo.boundingBox.min.x;
        var doorLabel = new THREE.Mesh(doorGeo, labelMat);
        doorLabel.position.set(
          yOffset + container.dy / 2 - doorW / 2,
          -LABEL_SIZE,
          container.dx + LABEL_SIZE * 2
        );
        doorLabel.rotation.x = -Math.PI / 2;
        scene.add(doorLabel);

        if(container.dx > maxLength) maxLength = container.dx;
        if(container.dz > maxHeight) maxHeight = container.dz;

        yOffset += container.dy + DOCK_GAP;
      }
      totalWidth = yOffset - DOCK_GAP;
      
      camera.position.z = maxLength * 0.8;
      camera.position.y = maxHeight * 2;
      camera.position.x = totalWidth * 0.8;
      
      // Grid
      var gridSize = Math.max(totalWidth, maxLength) + GRID_SPACING * 4;
      gridSize = Math.ceil(gridSize / GRID_SPACING) * GRID_SPACING;
      let gridXZ = new THREE.GridHelper(
        gridSize, gridSize / GRID_SPACING,
        0x42a5f5, 0x42a5f5
      );
      scene.add(gridXZ);
      gridXZ.position.y = 0;
      gridXZ.position.x = gridSize / 2 - GRID_SPACING;
      gridXZ.position.z = gridSize / 2 - GRID_SPACING;

    };

    const dataUrl = this.props.dataSource || (process.env.PUBLIC_URL + "/assets/containers.json");
    http(dataUrl).then(load);

    this._pollInterval = setInterval(function(){ 
      http(dataUrl).then(load);
    }, 500);
  };

  start = () => {
    if (!this.frameId) {
      this.frameId = requestAnimationFrame(this.animate);
    }
  };
  stop = () => {
    cancelAnimationFrame(this.frameId);
  };

  renderScene = () => {
    if (this.renderer) {
      this.renderer.render(this.scene, camera);
    }
  };

  componentWillUnmount() {
    this.stop();

    if (this._pollInterval) {
      clearInterval(this._pollInterval);
    }

    document.removeEventListener("mousemove", this.onDocumentMouseMove, false);
    window.removeEventListener("resize", this.onWindowResize, false);
    document.removeEventListener("keydown", this.onDocumentKeyDown, false);
    document.removeEventListener("keyup", this.onDocumentKeyUp, false);
    document.removeEventListener("click", this.onDocumentClick, false);
    document.removeEventListener("contextmenu", this.onDocumentRightClick, false);
    if (this._onOptionDown) window.removeEventListener("keydown", this._onOptionDown, false);
    if (this._onOptionUp) window.removeEventListener("keyup", this._onOptionUp, false);

    if (this.mount && this.renderer) {
      this.mount.removeChild(this.renderer.domElement);
    }
  }

  onDocumentClick = event => {
    if (!this.mount || !boxesGroup) return;

    const rect = this.mount.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(boxesGroup.children, true);
    if (intersects.length === 0) {
      this.setState({ selectedBox: null });
      return;
    }
    for(let i = 0; i < intersects.length; i++) {
      const mesh = intersects[i].object;
      const box = mesh.userData.box;
      if (!box) {
        continue;
      }
      if(stepNumber > mesh.userData.step) {
        this.setState({ selectedBox: box });
        return
      }
    }
     this.setState({ selectedBox: null });
  };

  onDocumentRightClick = event => {
      console.log("Right-click detected!");
      //event.preventDefault(); // Prevents the default context menu from appearing
      this.fitCameraToObject(camera, controls, mainGroup, 1.5);
  };

  onWindowResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  onDocumentMouseMove = event => {
    event.preventDefault();

    if (event && typeof event !== undefined) {
      pointer.x = ( event.clientX / window.innerWidth ) * 2 - 1;
      pointer.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
    }
  };

  onDocumentKeyDown = event => {
    shouldAnimate = false;
    var keyCode = event.which;
    switch (keyCode) {
      case 49: {
        // shaderMesh1.rotation.x += ROTATION_ANGLE; //W
        mainGroup.rotation.y += 0.1;
        break;
      }
      case 50: {
        // shaderMesh1.rotation.x -= ROTATION_ANGLE; //S
        mainGroup.rotation.y -= 0.1;
        break;
      }
      case 65: {
        stepNumber++;
        if(stepNumber > maxStepNumber) {
          stepNumber = 0;
        }
        console.log("Shop step number " + stepNumber);
        this.handleStepNumber();

        pointNumber = -1;
        
        break;
      }
      case 68: {
        stepNumber--;
        if(stepNumber < minStepNumber) {
          stepNumber = maxStepNumber;
        }
        console.log("Shop step number " + stepNumber);
        this.handleStepNumber();
        
        break;
      }
      case 80: {
        points = !points;
        this.pointNumber = -1;
        if(points) {
          console.log("Show points");
        } else {
          console.log("Hide points");
        }
        
        this.handleStepNumber();
        this.renderScene();

        break;
      }
      case 87: {
        // 
        pointNumber++;
        if(pointNumber >= maxPointNumbers[stepNumber - 1]) {
          pointNumber = 0;
        }        
        console.log("Shop point number " + pointNumber + " of " + maxPointNumbers[stepNumber-1]);
        this.handleStepNumber();
        break;
      }
      case 83: {
        // 
        pointNumber--;
        if(pointNumber < 0) {
          pointNumber = maxPointNumbers[stepNumber - 1]-1;
        }
        console.log("Shop point number " + pointNumber + " of " + maxPointNumbers[stepNumber-1]);
        this.handleStepNumber();

        break;
      }
      case 32: {
        this.fitCameraToObject(camera, controls, mainGroup, 1.5);
        break
      }
      default: {
        break;
      }
    }
  };
  onDocumentKeyUp = event => {
    var keyCode = event.which;
    shouldAnimate = true;
    console.log("onKey Up " + keyCode);
  };

  /**
   * Boilder plate to add LIGHTS, Renderer, Axis, Grid,
   */
  addScene = () => {
    const width = this.mount.clientWidth;
    const height = this.mount.clientHeight;
    this.scene = new THREE.Scene();

    // ------- Add RENDERED ------
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setClearColor("#263238");
    this.renderer.setSize(width, height);
    this.mount.appendChild(this.renderer.domElement);

    // -------Add CAMERA ------
    camera = new THREE.PerspectiveCamera(80, width / height, 0.1, 100000);
    camera.position.z = -50;
    camera.position.y = 50;
    camera.position.x = -50;
//    camera.lookAt(new THREE.Vector3(19000, 0, 0));

    //------Add ORBIT CONTROLS--------
    controls = new OrbitControls(camera, this.renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.enableZoom = true;
    controls.autoRotate = false;
    controls.keys = {
      LEFT: 37, //left arrow
      UP: 38, // up arrow
      RIGHT: 39, // right arrow
      BOTTOM: 40 // down arrow
    };

    // Option/Alt key: switch left-click from orbit to free pan
    const defaultMouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    const panMouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    controls.mouseButtons = defaultMouseButtons;

    this._onOptionDown = (e) => {
      if (e.altKey) controls.mouseButtons = panMouseButtons;
    };
    this._onOptionUp = (e) => {
      if (!e.altKey) controls.mouseButtons = defaultMouseButtons;
    };
    window.addEventListener("keydown", this._onOptionDown, false);
    window.addEventListener("keyup", this._onOptionUp, false);

    controls.addEventListener("change", () => {
      if (this.renderer) this.renderer.render(this.scene, camera);
    });

    raycaster = new THREE.Raycaster();

    var ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    
    this.scene.add(ambientLight);
  };

  //-------------HELPER------------------
  render() {

    const { selectedBox } = this.state;

    return (
      <div>
        <div
          style={{ width: window.innerWidth, height: window.innerHeight }}
          ref={mount => {
            this.mount = mount;
          }}
        />
      {/* Box info panel */}
      <div
        style={{
          position: "absolute",
          zIndex: 2,
          top: 0,
          right: 0,
          padding: "8px",
          maxWidth: "260px",
          background: "rgba(0, 0, 0, 0.5)",
          color: "#fff",
          textAlign: "left"
        }}
      >
          {selectedBox && (
            <div>
              {selectedBox.id && <div><b>{selectedBox.id}</b></div>}
              {selectedBox.name && <div>{selectedBox.name}</div>}
              <div>
                {selectedBox.location.x} × {selectedBox.location.y} × {selectedBox.location.z}
              </div>
              <div>
                {selectedBox.dimensions.dx} × {selectedBox.dimensions.dy} × {selectedBox.dimensions.dz}
              </div>
              <div>Step #{selectedBox.step}</div>
            </div>
          )}
        </div>        
      </div>
    );
  }
}

export default ThreeScene;
