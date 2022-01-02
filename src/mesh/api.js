/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

// dep: ext.three
// dep: ext.three-bgu
gapp.load(bind, "mesh.api", [
    "moto.license", // dep: moto.license
    "moto.client",  // dep: moto.client
    "moto.broker",  // dep: moto.broker
    "moto.space",   // dep: moto.space
    "mesh.tool",    // dep: mesh.tool
    "add.array",    // dep: add.array
]);

function bind() {
    broker = gapp.broker;
    // publish messages with results of function call
    // selection.move = broker.wrap('selection.move', selection.move);
    // selection.rotate = broker.wrap('selection.rotate', selection.rotate);
    // selection.update = broker.wrap('selection.update', selection.update);
}

let mesh = self.mesh = self.mesh || {};
if (mesh.api) return;

let space = moto.Space;
let groups = [];
let selected = [];
let broker;

let selection = {
    // @returns {MeshObject[]}
    list() {
        return selected.slice();
    },

    groups() {
        let all = selection.list();
        let grp = all.filter(s => s instanceof mesh.group);
        let mdl = all.filter(s => s instanceof mesh.model);
        for (let m of mdl) {
            grp.addOnce(m.group);
        }
        return grp;
    },

    models() {
        let all = selection.list();
        let grp = all.filter(s => s instanceof mesh.group);
        let mdl = all.filter(s => s instanceof mesh.model);
        for (let g of grp) {
            for (let m of g.models) {
                mdl.addOnce(m);
            }
        }
        return mdl;
    },

    // @param group {MeshObject[]}
    set(objects) {
        selected = objects;
        this.update();
    },

    // @param group {MeshObject}
    add(object) {
        selected.addOnce(object);
        this.update();
    },

    toggle(object) {
        selected.remove(object) || selected.addOnce(object);
        this.update();
    },

    // @param group {MeshObject}
    remove(object) {
        selected.remove(object);
        this.update();
    },

    clear() {
        selected = [];
        this.update();
    },

    update() {
        for (let group of groups) {
            group.material(mesh.material.unselected);
        }
        for (let object of selected) {
            object.material(mesh.material.selected);
        }
        return selection;
    },

    move(dx = 0, dy = 0, dz = 0) {
        for (let s of selected) {
            s.move(dx, dy, dz);
        }
        return selection;
    },

    rotate(dx = 0, dy = 0, dz = 0) {
        for (let s of selected) {
            s.rotate(dx, dy, dz);
        }
        return selection;
    },

    qrotate(q) {
        for (let s of selected) {
            s.qrotate(q);
        }
        return selection;
    },

    scale(dx = 0, dy = 0, dz = 0) {
        for (let s of selected) {
            let { x, y, z } = s.scale();
            s.scale(x + dx, y + dy, z + dz);
        }
        return selection;
    },

    floor() {
        for (let s of selected) {
            s.floor(...arguments);
        }
        return selection;
    },

    centerXY() {
        for (let s of selected) {
            s.centerXY(...arguments);
        }
        return selection;
    },

    wireframe() {
        for (let m of selection.models()) {
            m.wireframe(...arguments);
        }
        return selection;
    },

    boundsBox() {
        for (let m of selection.groups()) {
            m.showBounds(...arguments);
        }
        return selection;
    },

    home() {
        return selection.centerXY().floor();
    },

    focus() {
        api.focus(selected);
    },

    bounds() {
        return util.bounds(selected.map(s => s.object()));
    }
};

let group = {
    // @returns {MeshGroup[]}
    list() {
        return groups.slice();
    },

    // @param group {MeshModel[]}
    new: (models) => {
        return group.add(new mesh.group(models));
    },

    // @param group {MeshGroup}
    add: (group) => {
        groups.addOnce(group);
        space.world.add(group.group);
        space.update();
        return group;
    },

    // @param group {MeshGroup}
    remove: (group) => {
        groups.remove(group);
        space.world.remove(group.group);
        space.update();
    }
};

let api = mesh.api = {
    clear: () => {
        for (let group of group.list()) {
            group.remove(group);
        }
    },

    // @param object {THREE.Object3D | THREE.Object3D[]}
    focus: (object) => {
        let { center } = util.bounds(object);
        // when no valid objects supplied, set origin
        if (isNaN(center.x * center.y * center.z)) {
            center = { x: 0, y: 0, z: 0 };
        }
        // sets "home" views (front, back, home, reset)
        space.platform.setCenter(center.x, -center.y, center.z);
        // sets camera focus
        space.view.setFocus(new THREE.Vector3(
            center.x, center.z, -center.y
        ));
    },

    selection,

    group,

    model: {
        // @returns {MeshModel[]}
        list() {
            return groups.map(g => g.models).flat();
        },

        // @param group {MeshModel}
        remove: (model) => {
            model.group.remove(model);
        }
    },

    objects: () => {
        // return models, not groups
        return group.list().map(o => o.models).flat().map(o => o.object());
    }
};

let util = mesh.util = {

    // @param object {THREE.Object3D | THREE.Object3D[] | MeshObject | MeshObject[]}
    // @returns bounds modified for moto.Space
    bounds: (object) => {
        let box = new THREE.Box3();
        if (Array.isArray(object)) {
            for (let o of object) {
                util.box3expand(box, o instanceof mesh.object ? o.object() : o);
            }
        } else if (object) {
            util.box3expand(box, object instanceof mesh.object ? object.object() : object);
        } else {
            return box;
        }
        let bnd = {
            min: {
                x: box.min.x,
                y: box.min.z,
                z: box.min.y
                },
            max: {
                x: box.max.x,
                y: box.max.z,
                z: box.max.y
            }
        };
        bnd.size = {
            x: bnd.max.x - bnd.min.x,
            y: bnd.max.y - bnd.min.y,
            z: bnd.max.z - bnd.min.z
        };
        bnd.center = {
            x: (bnd.max.x + bnd.min.x) / 2,
            y: -(bnd.max.y + bnd.min.y) / 2,
            z: (bnd.max.z + bnd.min.z) / 2
        };
        return bnd;
    },

    // bounding box workaround adapted from:
    // https://discourse.threejs.org/t/bounding-box-bigger-than-concave-object-extrudegeometry/26073/2
    box3expand: (box3, object) => {
        const geometry = object.geometry;
        object.updateWorldMatrix(geometry ? true : false, false);

        if (geometry) {
            let bounds = util.geoBounds(geometry, object.matrixWorld);
            let bt = new THREE.Box3().copy(bounds);
            let m4 = new THREE.Matrix4();
            m4.setPosition(new THREE.Vector3().setFromMatrixPosition(object.matrixWorld));
            bt.applyMatrix4(m4);
            box3.union(bt);
        }

        const children = object.children;
        for (let i = 0, l = children.length; i < l; i++) {
            util.box3expand(box3, children[i]);
        }
    },

    // second half of bound box workaround (see above)
    geoBounds: (geometry, matrix) => {
        const boundingBox = new THREE.Box3();
        const position = geometry.attributes.position.clone();

        if (matrix) {
            position.applyMatrix4(new THREE.Matrix4().extractRotation(matrix));
        }

        if (position.isGLBufferAttribute) {
            console.error('THREE.BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box. Alternatively set "mesh.frustumCulled" to "false".', this);
        }

        boundingBox.setFromBufferAttribute(position);

        const morphAttributesPosition = geometry.morphAttributes.position;
        if (morphAttributesPosition) {
            for (let i = 0, il = morphAttributesPosition.length; i < il; i++) {
                const box3 = new THREE.Box3().setFromBufferAttribute(morphAttributesPosition[i]);

                if (geometry.morphTargetsRelative) {
                    let vector = new THREE.Vector3();
                    vector.addVectors(boundingBox.min, box3.min);
                    boundingBox.expandByPoint(vector);
                    vector.addVectors(boundingBox.max, box3.max);
                    boundingBox.expandByPoint(vector);
                } else {
                    boundingBox.expandByPoint(box3.min);
                    boundingBox.expandByPoint(box3.max);
                }
            }
        }

        if (isNaN(boundingBox.min.x) || isNaN(boundingBox.min.y) || isNaN(boundingBox.min.z)) {
            console.error('THREE.BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.', this);
        }

        return boundingBox;
    }

};

})();
