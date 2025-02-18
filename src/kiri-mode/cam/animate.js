/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: kiri-mode.cam.driver
// dep: kiri-mode.cam.animate2
gapp.register("kiri-mode.cam.animate", [], (root, exports) => {

const { kiri } = root;
const { driver } = kiri;
const { CAM } = driver;
const asLines = false;
const asPoints = false;

// ---( CLIENT FUNCTIONS )---

kiri.load(() => {
    if (!kiri.client) {
        return;
    }

    let meshes = {},
        unitScale = 1,
        progress,
        speedValues = [ 1, 2, 4, 8, 32 ],
        speedPauses = [ 30, 20, 10, 5, 0 ],
        speedNames = [ "1x", "2x", "4x", "8x", "!!" ],
        speedMax = speedValues.length - 1,
        speedIndex = 0,
        speedLabel,
        speed,
        color = 0,
        pauseButton,
        playButton,
        posOffset = { x:0, y:0, z:0 };

    const { moto } = root;
    const { space } = moto;
    const { api } = kiri;

    function animate_clear(api) {
        moto.space.platform.showGridBelow(true);
        kiri.client.animate_cleanup();
        $('layer-animate').innerHTML = '';
        $('layer-toolpos').innerHTML = '';
        Object.keys(meshes).forEach(id => deleteMesh(id));
    }

    function animate(api, delay) {
        let alert = api.alerts.show("building animation");
        kiri.client.animate_setup(api.conf.get(), data => {
            checkMeshCommands(data);
            if (!(data && data.mesh_add)) {
                return;
            }
            const UC = api.uc;
            const layer = $('layer-animate');
            layer.innerHTML = '';
            UC.setGroup(layer);
            UC.newRow([
                UC.newButton(null,replay,{icon:'<i class="fas fa-fast-backward"></i>',title:"restart"}),
                playButton = UC.newButton(null,play,{icon:'<i class="fas fa-play"></i>',title:"play"}),
                pauseButton = UC.newButton(null,pause,{icon:'<i class="fas fa-pause"></i>',title:"pause"}),
                UC.newButton(null,step,{icon:'<i class="fas fa-step-forward"></i>',title:"single step"}),
                UC.newButton(null,fast,{icon:'<i class="fas fa-forward"></i>',title:"toggle speed"}),
                speedLabel = UC.newLabel("speed", {class:"speed"}),
                progress = UC.newLabel('0%', {class:"progress"})
            ]);
            updateSpeed();
            setTimeout(step, delay || 0);
            const toolpos = $('layer-toolpos');
            toolpos.innerHTML = '';
            UC.setGroup(toolpos);
            playButton.style.display = '';
            pauseButton.style.display = 'none';
            api.event.emit('animate', 'CAM');
            api.alerts.hide(alert);
            moto.space.platform.showGridBelow(false);
        });
    }

    gapp.overlay(kiri.client, {
        animate(data, ondone) {
            kiri.client.send("animate", data, ondone);
        },

        animate_setup(settings, ondone) {
            color = settings.controller.dark ? 0x888888 : 0;
            unitScale = settings.controller.units === 'in' ? 1/25.4 : 1;
            kiri.client.send("animate_setup", {settings}, ondone);
        },

        animate_cleanup(data, ondone) {
            kiri.client.send("animate_cleanup", data, ondone);
        }
    });

    gapp.overlay(CAM, {
        animate,
        animate_clear
    });

    function meshAdd(id, ind, pos, sab) {
        const geo = new THREE.BufferGeometry();
        if (sab) {
            // use array buffer shared with worker
            pos = new Float32Array(sab);
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        if (ind.length) {
            geo.setIndex(new THREE.BufferAttribute(new Uint32Array(ind), 1));
        }
        let mesh;
        if (asPoints) {
            const mat = new THREE.PointsMaterial({
                transparent: true,
                opacity: 0.75,
                color: 0x888888,
                size: 0.3
            });
            mesh = new THREE.Points(geo, mat);
        } else if (asLines) {
            const mat = new THREE.LineBasicMaterial({
                transparent: true,
                opacity: 0.75,
                color
            });
            mesh = new THREE.LineSegments(geo, mat);
        } else {
            let shininess = 120,
                specular = 0x202020,
                emissive = 0x101010,
                metalness = 0.2,
                roughness = 0.8,
                flatShading = true,
                transparent = true,
                opacity = 0.9,
                color = 0x888888,
                side = THREE.DoubleSide;
            if (!flatShading) {
                geo.computeVertexNormals();
            }
            const mat = new THREE.MeshMatcapMaterial({
                flatShading,
                transparent,
                opacity,
                color,
                side
            });
            mesh = new THREE.Mesh(geo, mat);
        }
        space.world.add(mesh);
        meshes[id] = mesh;
    }

    function meshUpdates(id) {
        const mesh = meshes[id];
        if (!mesh) {
            return; // animate cancelled
        }
        mesh.geometry.attributes.position.needsUpdate = true;
        space.update();
    }

    function deleteMesh(id) {
        space.world.remove(meshes[id]);
        delete meshes[id];
    }

    function step() {
        updateSpeed();
        kiri.client.animate({speed, steps: 1}, handleGridUpdate);
    }

    function play(opts) {
        const { steps } = opts;
        updateSpeed();
        if (steps !== 1) {
            playButton.style.display = 'none';
            pauseButton.style.display = '';
            $('render-hide').onclick();
        }
        kiri.client.animate({
            speed,
            steps: steps || Infinity,
            pause: speedPauses[speedIndex]
        }, handleGridUpdate);
    }

    function fast(opts) {
        const { steps } = opts;
        updateSpeed(1);
        playButton.style.display = 'none';
        pauseButton.style.display = '';
        $('render-hide').onclick();
        kiri.client.animate({
            speed,
            steps: steps || Infinity,
            pause: speedPauses[speedIndex]
        }, handleGridUpdate);
    }

    function pause() {
        playButton.style.display = '';
        pauseButton.style.display = 'none';
        kiri.client.animate({speed: 0}, handleGridUpdate);
    }

    function handleGridUpdate(data) {
        checkMeshCommands(data);
        if (data && data.progress) {
            progress.innerText = (data.progress * 100).toFixed(1) + '%'
        }
    }

    function updateSpeed(inc = 0) {
        if (inc === Infinity) {
            speedIndex = speedMax;
        } else if (inc > 0) {
            speedIndex = (speedIndex + inc) % speedValues.length;
        }
        speed = speedValues[speedIndex];
        speedLabel.innerText = speedNames[speedIndex];
    }

    function replay() {
        animate_clear(api);
        setTimeout(() => {
            animate(api, 50);
        }, 250);
    }

    function checkMeshCommands(data) {
        if (!data) {
            return;
        }
        if (data.mesh_add) {
            const { id, ind, pos, offset, sab } = data.mesh_add;
            meshAdd(id, ind, pos, sab);
            space.refresh();
            if (offset) {
                posOffset = offset;
            }
        }
        if (data.mesh_del) {
            deleteMesh(data.mesh_del);
        }
        if (data.mesh_move) {
            const { id, pos } = data.mesh_move;
            const mesh = meshes[id];
            if (mesh) {
                mesh.position.x = pos.x;
                mesh.position.y = pos.y;
                mesh.position.z = pos.z;
                space.update();
            }
        }
        if (data.mesh_update) {
            meshUpdates(data.id);
        }
    }

});

// ---( WORKER FUNCTIONS )---

kiri.load(() => {
    if (!kiri.worker) {
        return;
    }

    let stock, center, grid, gridX, gridY, rez;
    let path, pathIndex, tool, tools, last, toolID = 1;

    kiri.worker.animate_setup = function(data, send) {
        const { settings } = data;
        const { process } = settings;
        const print = worker.print;
        const density = parseInt(settings.controller.animesh) * 1000;

        pathIndex = 0;
        path = print.output.flat();
        tools = settings.tools;
        stock = settings.stock;

        rez = 1/Math.sqrt(density/(stock.x * stock.y));

        const step = rez;
        const stepsX = Math.floor(stock.x / step);
        const stepsY = Math.floor(stock.y / step);
        const { pos, ind, sab } = createGrid(stepsX, stepsY, stock, step);
        const offset = {
            x: process.outputOriginCenter ? 0 : stock.x / 2,
            y: process.outputOriginCenter ? 0 : stock.y / 2,
            z: process.camOriginTop ? -stock.z : 0
        }

        grid = pos;
        gridX = stepsX;
        gridY = stepsY;

        tool = null;
        last = null;
        animating = false;
        animateClear = false;

        center = Object.assign({}, stock.center);
        center.z -= stock.z / 2;

        send.data({ mesh_add: { id: 0, ind, offset, sab } }, [ ]); // sab not transferrable
        send.data({ mesh_move: { id: 0, pos: center } });
        send.done();
    };

    kiri.worker.animate = function(data, send) {
        renderPause = data.pause || renderPause;
        renderSpeed = data.speed || 0;
        if (animating) {
            return send.done();
        }
        renderSteps = data.steps || 1;
        renderDone = false;
        animating = renderSpeed > 0;
        renderPath(send);
    };

    kiri.worker.animate_cleanup = function(data, send) {
        if (animating) {
            animateClear = true;
        }
    };

    function createGrid(stepsX, stepsY, size, step) {
        const gridPoints = stepsX * stepsY;
        const sab = new SharedArrayBuffer(gridPoints * 3 * 4)
        const pos = new Float32Array(sab);
        const ind = [];
        const ox = size.x / 2;
        const oy = size.y / 2;

        // initialize grid points
        for (let x=0, ai=0; x<stepsX; x++) {
            for (let y=0; y<stepsY; y++) {
                let px = pos[ai++] = x * step - ox + step / 2;
                let py = pos[ai++] = y * step - oy + step / 2;
                pos[ai++] = size.z;
                if (asPoints) {
                    continue;
                }
                if (asLines) {
                    if (y > 0) ind.appendAll([
                        (stepsY * x) + (y - 1),
                        (stepsY * x) + (y    )
                    ]);
                    if (x > 0) ind.appendAll([
                        (stepsY * (x - 1)) + y,
                        (stepsY * (x    )) + y
                    ]);
                } else {
                    if (x > 0 && y > 0) {
                        let v0 = stepsY * (x - 1) + y - 1;
                        let v1 = stepsY * (x - 0) + y - 1;
                        let v2 = stepsY * (x - 0) + y;
                        let v3 = stepsY * (x - 1) + y;
                        ind.appendAll([
                            v0, v1, v2, v0, v2, v3
                        ]);
                    }
                }
            }
        }

        return { pos, ind, sab };
    }

    let animateClear = false;
    let animating = false;
    let renderDist = 0;
    let renderDone = false;
    let renderPause = 10;
    let renderSteps = 0;
    let renderSpeed = 0;
    let skipMove = null;
    let toolUpdate;

    // send latest tool position and progress bar
    function renderUpdate(send) {
        if (toolUpdate) {
            send.data(toolUpdate);
        }
        send.data({ progress: pathIndex / path.length, id: 0, mesh_update: 1 });
    }

    function renderPath(send) {
        if (renderDone) {
            return;
        }

        if (renderSteps-- === 0) {
            animating = false;
            renderPath(send);
            return;
        }

        if (animating === false || animateClear || renderSpeed === 0) {
            renderUpdate(send);
            renderDone = true;
            animating = false;
            animateClear = false;
            send.done();
            return;
        }

        let next = path[pathIndex];
        while (next && next.type === 'laser') {
            last = next;
            next = path[++pathIndex];
        }

        if (!next) {
            animating = false;
            renderPath(send);
            return;
        }
        pathIndex++;

        if (next.tool >= 0 && (!tool || tool.getNumber() !== next.tool)) {
            // on real tool change, go to safe Z first
            if (tool && last.point) {
                let pos = last.point = {
                    x: last.point.x,
                    y: last.point.y,
                    z: stock.z
                };
                send.data({ mesh_move: { toolID, pos }});
            }
            updateTool(next.tool, send);
        }

        const id = toolID;
        const rezstep = rez;
        if (last) {
            const lp = last.point, np = next.point;
            last = next;
            // dwell ops have no point
            if (!np || !lp) {
                return renderPath(send);
            }
            const dx = np.x - lp.x, dy = np.y - lp.y, dz = np.z - lp.z;
            const dist = Math.sqrt(dx*dx  + dy*dy + dz*dz);
            renderDist += dist;

            // skip moves that are less than grid resolution
            if (renderDist < rezstep) {
                renderPath(send);
                return;
            }

            const md = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
            const st = Math.ceil(md / rezstep);
            const mx = dx / st, my = dy / st, mz = dz / st;
            const moves = [];
            for (let i=0, x=lp.x, y=lp.y, z=lp.z; i<st; i++) {
                moves.push({x,y,z});
                x += mx;
                y += my;
                z += mz;
            }
            moves.push(next.point);
            renderMoves(id, moves, send);
        } else {
            last = next;
            if (tool) {
                tool.pos = next.point;
                toolUpdate = { mesh_move: { id, pos: next.point }};
            }
            renderPath(send);
        }
    }

    function renderMoves(id, moves, send, seed = 0) {
        for (let index = seed; index<moves.length; index++) {
            const pos = moves[index];
            if (!pos) {
                throw `no pos @ ${index} of ${moves.length}`;
            }
            tool.pos = pos;
            deformMesh(pos, send);
            toolUpdate = { mesh_move: { id, pos }};
            // pause renderer at specified offsets
            if (renderSpeed && renderDist >= renderSpeed) {
                renderDist = 0;
                renderUpdate(send);
                setTimeout(() => {
                    renderMoves(id, moves, send, index);
                }, renderPause);
                return;
            }
        }
        renderPath(send);
    }

    // update stock mesh to reflect tool tip geometry at given XYZ position
    function deformMesh(pos, send) {
        const prof = tool.profile;
        const { size, pix } = tool.profileDim;
        const mid = Math.floor(pix / 2);
        const rx = Math.floor((pos.x + stock.x / 2 - size / 2 - center.x) / rez);
        const ry = Math.floor((pos.y + stock.y / 2 - size / 2 - center.y) / rez);
        let upos = 0;
        // deform mesh to lowest point on tool profile
        for (let i=0, il=prof.length; i < il; ) {
            const dx = mid + prof[i++];
            const dy = mid + prof[i++];
            const dz = prof[i++];
            const gx = rx + dx;
            const gy = ry + dy;

            if (gx < 0|| gy < 0 || gx > gridX-1 || gy > gridY-1) {
                continue;
            }

            const gi = gx * gridY + gy;
            const iz = gi * 3 + 2;
            const cz = grid[iz];
            const tz = tool.pos.z - dz;
            if (tz < cz) {
                upos++;
                grid[iz] = tz;
            }
        }
    }

    function updateTool(toolnum, send) {
        if (tool) {
            send.data({ mesh_del: toolID });
        }
        tool = new CAM.Tool({ tools }, undefined, toolnum);
        tool.generateProfile(rez);
        const flen = tool.fluteLength() || 15;
        const slen = tool.shaftLength() || 15;
        // const frad = tool.fluteDiameter() / 2;
        const prof = tool.profile;
        const { size, pix } = tool.profileDim;
        const { pos, ind, sab } = createGrid(pix, pix, {x:size, y:size, z:flen+slen}, rez);
        const mid = Math.floor(pix/2);
        // deform mesh to fit tool profile
        for (let i=0, il=prof.length; i < il; ) {
            const dx = mid + prof[i++];
            const dy = mid + prof[i++];
            const dz = prof[i++];
            pos[(dx * pix + dy) * 3 + 2] = -dz;
        }
        send.data({ mesh_add: { id:++toolID, ind, sab }});
    }

});

});
