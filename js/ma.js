/*
	Drawing Turtle Graphics
	Copyright (C) 2014 Matthias Graf
	matthias.graf <a> eclasca.de
	
	This program is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
	GNU Affero General Public License for more details.

	You should have received a copy of the GNU Affero General Public License
	along with this program. If not, see <http://www.gnu.org/licenses/>.
*/

ma = function() { // spans everything - not indented
var ma = {}

var mainSVG
var svgWidth
var svgHeight
const zoomFactor = 1.3

// http://www.cambiaresearch.com/articles/15/javascript-char-codes-key-codes
const keyMap = { d:68, s:83, e:69, f:70, g:71, "+":107, "-":109, p:80, del: 46 }
var keyPressed = { d:false, s:false, e:false, f:false, g:false, "+":false, "-":false, p:false, del: false }
const mouseMap = { 0: "left", 1: "middle", 2: "right" }
var mousePressed = { left: false, middle: false, right: false }

const turtleHomeStyle = {fill: "none", stroke: "#d07f00", "stroke-width": ".2", "stroke-linecap": "round"}
const turtleStyle = {fill: "#ffba4c", "fill-opacity": 0.6, stroke: "none"}
const lineStyle = {stroke: "#000", "stroke-width": ".25", "stroke-linecap": "round"}
const arcStyle = {fill: "#000", "fill-opacity": 0.1}
const clockStyle = {fill: "none", stroke: "#777", "stroke-width": ".15"}
const clockHandStyle = {fill: "#000", "fill-opacity": 0.2}
const textStyle = {fill: "#666", "font-family": "Open Sans", "font-size": "1.5px", "text-anchor": "middle"}

const loopClockRadius = 1.3
const rotationArcRadius = 6
var functionPanelSizePercentOfBodyWidth = 0.2
var lastNotificationUpdateTime

var mousePos = [0,0]
var mousePosPrevious = [0,0]

var functions = []
// the function that is currently selected
var F_

var dragInProgress = false

function State() {
	this.reset()
}

State.prototype.addRadius = function(rr) {
	if (rr > Math.PI || rr < -Math.PI)
		console.log("Warning: addRadius: rr out of [-Pi, Pi]")
	this.r += rr
	this.r = correctRadius(this.r)
}

State.prototype.reset = function() {
	this.x = 0
	this.y = 0
	// r: 0 is North, -Math.PI/2 is West. r is in [-Pi, Pi].
	this.r = 0
}

State.prototype.clone = function() {
	var s = new State()
	s.x = this.x
	s.y = this.y
	s.r = this.r
	return s
}

var selection = {
	e: undefined,
	add: function(elem) {
		if (!selection.isEmpty()) {
			selection.e.deselect()
		}
		selection.e = elem
	},
	isEmpty: function() {
		return selection.e === undefined
	},
	deselectAll: function() {
		if (!selection.isEmpty()) {
			selection.e.deselect()
			selection.e = undefined
		}
	},
	removeAll: function() {
		if (!selection.isEmpty()) {
			selection.e.deselect()
			// TODO splice from commands (what is its f?)
			selection.e.removeFromMainSVG()
			selection.e = undefined
		}
	}
}

ma.init = function() {
	mainSVG = new MainSVG()
	
	F_ = new Function("main")
	functions.push(F_)
	F_.svgContainer.classed("fSVGselected", true)
	F_.addArgument("someArg", 5)
	
	F_.commands = [
	//	new Rotate(1), new Move(10), new Loop(3, [new Loop(3, [new Rotate(-0.5), new Move(7)])])
		new Rotate(1), new Move(10), new Loop(3, [new Rotate(-0.5), new Move(7)])
	]
	
	d3.select("#f_addNew").on("click", function() {
		new Function("defaultName").switchTo()
	})
	
	setup()
	run()
}

function run() {
	F_.state.reset()
	// TODO for all functions
	for (var i=0; i<F_.commands.length; i++) {
		F_.commands[i].savedState = undefined
		F_.commands[i].exec(F_)
	}
	F_.updateTurtle()
	mainSVG.updateTurtle()
}

function updateScreenElemsSize() {
//	var winW = document.body.clientWidth
//	var winH = window.innerHeight
	
	var bb = document.getElementById("turtleSVGcontainer").getBoundingClientRect()
	svgWidth = bb.width
	svgHeight = bb.height
	
	for (var i=0; i<functions.length; i++)
		functions[i].updateViewbox()
	mainSVG.updateViewbox()
}

function updatePanelSize() {
	d3.select("#border").style("left", functionPanelSizePercentOfBodyWidth*100+"%", "important")
	d3.select("#functions").style("width", functionPanelSizePercentOfBodyWidth*100+"%", "important")
	d3.select("#turtleSVGcontainer").style("width", (1-functionPanelSizePercentOfBodyWidth)*100+"%", "important")
	window.onresize()
}




function MainSVG() {
	var self = this
	self.svg = d3.select("#turtleSVG").attr("xmlns", "http://www.w3.org/2000/svg")
	self.svgInit()
}

function setup() {
	var domSvg = document.getElementById("turtleSVG")
	
	window.onresize = function(event) {
		updateScreenElemsSize()
	}
//	updatePanelSize()
	window.onresize()
	
	d3.select("#border").call(d3.behavior.drag()
		.on("drag", function (d) {
			functionPanelSizePercentOfBodyWidth = Math.max(0.1, Math.min(0.4,
				d3.event.x / document.body.clientWidth))
			updatePanelSize()
		})
	)
	
	function zoom(event) {
		var wheelMovement = Math.max(-1, Math.min(1, (event.wheelDelta || -event.detail)))
		// ok, I cheated a bit ...
		d3.event = event
		var mouse = d3.mouse(domSvg)
		
		var xDelta = F_.svgViewboxWidth * (wheelMovement < 0 ? zoomFactor-1 : -(1-1/zoomFactor))
		var yDelta = F_.svgViewboxHeight * (wheelMovement < 0 ? zoomFactor-1 : -(1-1/zoomFactor))
		// zoom towards the current mouse position
		var relX = (mouse[0]-F_.svgViewboxX)/F_.svgViewboxWidth // in [0,1]
		var relY = (mouse[1]-F_.svgViewboxY)/F_.svgViewboxHeight // in [0,1]
		F_.svgViewboxX -= xDelta * relX
		F_.svgViewboxY -= yDelta * relY
		F_.svgViewboxWidth += xDelta
		F_.svgViewboxHeight += yDelta
		
		F_.updateViewbox()
		mainSVG.updateViewbox()
		d3.event = null
	}
	
	// IE9, Chrome, Safari, Opera
	domSvg.addEventListener("mousewheel", zoom, false)
	// Firefox
	domSvg.addEventListener("DOMMouseScroll", zoom, false)
	
	function switchMouseButton(evt, on) {
		if (mouseMap[evt.button] !== undefined)
			mousePressed[mouseMap[evt.button]] = on
	}
	document.body.onmousedown = function(evt) { switchMouseButton(evt, true) }
	document.body.onmouseup = function(evt) { switchMouseButton(evt, false) }
	
	mainSVG.svg.call(d3.behavior.drag()
		.on("drag", function (d) {
			if (mousePressed.middle) {
				F_.svgViewboxX -= d3.event.dx*(F_.svgViewboxWidth/svgWidth)
				F_.svgViewboxY -= d3.event.dy*(F_.svgViewboxHeight/svgHeight)
				F_.updateViewbox()
				mainSVG.updateViewbox()
			}
		})
	)
	
	mainSVG.svg.on("mousemove", function (d, i) {
		// TODO needed?
		mousePosPrevious = mousePos
		mousePos = d3.mouse(this)
		if (keyPressed.d) {
			updatePreviewLineDrawing()
		}
    })
	
	mainSVG.svg.on("click", function (d, i) {
//		mousePos = d3.mouse(this)
		console.assert(d3.mouse(this)[0]-mousePos[0] === 0)
		if (keyPressed.d) {
			removePreviewLine()
			drawLine()
			drawPreviewLine()
		} else {
			selection.deselectAll()
		}
    })
	
	d3.select("body")
		.on("keydown", function() { updateKeyDownAndUp(d3.event.keyCode, true) })
		.on("keyup", function() { updateKeyDownAndUp(d3.event.keyCode, false) })
}

function Function(name) {
	var self = this
	self.state = new State()
	
	self.svgViewboxWidth
	self.svgViewboxHeight = 100 // fix on startup
	self.svgViewboxX
	self.svgViewboxY
	self.svgWidth
	self.svgHeight
	
	self.li_f = d3.select("#ul_f").append("li").attr("id", "f_"+name)
	// this complicated wrapping is sadly necessary
	// http://stackoverflow.com/questions/17175038/css-dynamic-length-text-input-field-and-submit-button-in-one-row
	var titleRow = self.li_f.append("div").attr("class", "titleRow")
	
	self.nameInput = titleRow.append("div").attr("class", "titleRowCell")
		.append("input")
		.attr("class", "f_name")
		.attr("type", "text")
		.on("blur", function() {
			self.setName(this.value)
		})
		.on("keypress", function() {
			if (d3.event.keyCode === /*enter*/ 13)
				self.setName(this.value)
		})
		.on("input", function() {
			self.nameInput.classed({"inputInEditState": true})
			self.checkName(this.value)
		})
	
	titleRow.append("div").attr("class", "titleRowCell")
		.append("button").attr("class", "f_remove").text("x")
		.on("click", function() {
			// TODO dependency check
			if (functions.length > 1) {
				self.li_f.remove()
				functions.splice(functions.indexOf(self), 1)
				// TODO last used
				if (F_ === self) {
					F_ = functions[functions.length-1]
					F_.svgContainer.classed("fSVGselected", true)
				}
			} else {
				updateNotification("There has to be at least one function.")
			}
		})
	
	// TODO if check failed?
	self.setName(name)
	self.commands = []
	self.args = {}
	self.ul_args = self.li_f.append("ul").attr("class", "ul_args")
	
	self.svgContainer = self.li_f.append("div").attr("class", "fSVGcontainer")
	self.svg = self.svgContainer.append("svg").attr("class", "fSVG")
		.attr("xmlns", "http://www.w3.org/2000/svg")
	self.svg.on("click", function() {
		self.switchTo()
	})
	
	self.svgInit()
	
	return self
}

MainSVG.prototype.svgInit = Function.prototype.svgInit = function() {
	var self = this
	self.paintingG = self.svg.append("g").attr("class", "paintingG")
	
	const turtleHomeCursorPath = "M1,1 L0,-2 L-1,1 Z"
	self.turtleHomeCursor = self.svg.append("g").attr("class", "turtleHome")
	self.turtleHomeCursor.append("path").attr("d", turtleHomeCursorPath).style(turtleHomeStyle)
	
	self.turtleCursor = self.svg.append("g").attr("class", "turtle")
//	self.updateTurtle()
	self.turtleCursor.append("path").attr("d", turtleHomeCursorPath).style(turtleStyle)
}

MainSVG.prototype.updateTurtle = function() {
	var self = this
	self.turtleCursor.attr("transform", "translate("+F_.state.x+", "+F_.state.y+") rotate("+(F_.state.r/Math.PI*180)+")")
}

Function.prototype.updateTurtle = function() {
	var self = this
	self.turtleCursor.attr("transform", "translate("+self.state.x+", "+self.state.y+") rotate("+(self.state.r/Math.PI*180)+")")
}

MainSVG.prototype.updateViewbox = function() {
	console.assert(F_ !== undefined && !isNaN(F_.svgViewboxX) && !isNaN(F_.svgViewboxY)
		&& F_.svgViewboxWidth > 0 && F_.svgViewboxHeight > 0)
	this.svg.attr("viewBox", F_.svgViewboxX+" "+F_.svgViewboxY+" "
		+F_.svgViewboxWidth+" "+F_.svgViewboxHeight)
}

Function.prototype.updateViewbox = function() {
	var self = this
		// [0][0] gets the dom element
	// the preview svg aspect ratio is coupled to the main svg
	self.svgWidth = self.svgContainer[0][0].getBoundingClientRect().width
	self.svgHeight = self.svgWidth * svgHeight/svgWidth
	self.svgContainer.style({height: self.svgHeight+"px"})
	
	console.assert(self.svgWidth > 0 && self.svgViewboxHeight > 0 && svgWidth > 0 && svgHeight > 0)
	// keep height stable and center (on startup to 0,0)
	var svgViewboxWidthPrevious = self.svgViewboxWidth
	self.svgViewboxWidth = self.svgViewboxHeight * svgWidth/svgHeight
	if (svgViewboxWidthPrevious !== undefined)
		self.svgViewboxX -= (self.svgViewboxWidth - svgViewboxWidthPrevious)/2
	if (self.svgViewboxX === undefined)
		self.svgViewboxX = -self.svgViewboxWidth/2
	if (self.svgViewboxY === undefined)
		self.svgViewboxY = -self.svgViewboxHeight/2
	self.svg.attr("viewBox", self.svgViewboxX+" "+self.svgViewboxY+" "+self.svgViewboxWidth+" "+self.svgViewboxHeight)
}

Function.prototype.checkName = function(newName) {
	var regEx = /^[a-zA-Z][a-zA-Z0-9]*$/
	if (!newName.match(regEx)) {
		this.nameInput.classed({"inputInWrongState": true})
		updateNotification("The function name has to be alphanumeric and start with a letter: "+regEx)
		return false
	}
	// check for duplicates
	for (var i=0; i<functions.length; i++) {
		if (functions[i] !== this && functions[i].name === newName) {
			this.nameInput.classed({"inputInWrongState": true})
			updateNotification("Function name duplication.")
			return false
		}
	}
	this.nameInput.classed({"inputInWrongState": false})
	hideNotification()
	return true
}

Function.prototype.setName = function(newName) {
	var r = this.checkName(newName)
	if (r)
		this.name = newName
	this.nameInput.property("value", this.name)
	this.nameInput.classed({"inputInEditState": false, "inputInWrongState": false})
	hideNotification()
	return r
}

Function.prototype.addArgument = function(argName, defaultValue) {
	for (var name in this.args)
		if (name === argName) {
			updateNotification("Argument name duplication.")
			return
		}
	
	this.args[argName] = defaultValue
	this.ul_args.append("li").text(argName).append("span").text(":"+defaultValue)
}

Function.prototype.exec = function() {
	var self = this
	for (var i=0; i<self.commands.length; i++)
		self.commands[i].exec(self)
	self.updateTurtle()
}

Function.prototype.switchTo = function() {
	if (F_ !== undefined) {
		F_.svgContainer.classed("fSVGselected", false)
		for (var i=0; i<F_.commands.length; i++)
			F_.commands[i].removeFromMainSVG()
	}
	F_ = this
	functions.push(F_)
	F_.svgContainer.classed("fSVGselected", true)
	F_.updateViewbox()
	mainSVG.updateViewbox()
	run()
}




function drawLine() {
	var r = new Rotate(rotateAngleTo(mousePos))
	F_.commands.push(r)
	r.exec(F_)
	var m = new Move(getLineLengthTo(mousePos))
	F_.commands.push(m)
	m.exec(F_)
}

function drawPreviewLine() {
	F_.commands.push(new Rotate(0))
	F_.commands.push(new Move(0))
	updatePreviewLineDrawing()
}

function updatePreviewLineDrawing() {
	if (F_.commands.length < 2) {
		// this happens when update is called before draw, when body is not selected
		// because update is called, but key press is supressed
		drawPreviewLine()
	} else {
		var stateSave = F_.state.clone()
		F_.commands[F_.commands.length-2].angle = rotateAngleTo(mousePos)
		F_.commands[F_.commands.length-2].exec(F_)
		F_.commands[F_.commands.length-1].length = getLineLengthTo(mousePos)
		F_.commands[F_.commands.length-1].exec(F_)
		F_.updateTurtle()
		mainSVG.updateTurtle()
		F_.state = stateSave
	}
}

function removePreviewLine() {
	F_.commands[F_.commands.length-1].remove()
	F_.commands.splice(F_.commands.length-1, 1)
	F_.commands[F_.commands.length-1].remove()
	F_.commands.splice(F_.commands.length-1, 1)
}

function getAngleDeltaTo(dx, dy, r) {
	return correctRadius(Math.atan2(dy, dx) + Math.PI/2 - (r === undefined ? F_.state.r : r))
}

function getLineLengthTo(mousePos) {
	var dx = mousePos[0] - F_.state.x
	var dy = mousePos[1] - F_.state.y
	return Math.sqrt(dx*dx + dy*dy)
}

function rotateAngleTo(mousePos) {
	var dx = mousePos[0] - F_.state.x
	var dy = mousePos[1] - F_.state.y
	return getAngleDeltaTo(dx, dy)
}

function hideNotification() {
	d3.select("#notification").classed({"opacity0": true})
}

function updateNotification(text, displayTime) {
	lastNotificationUpdateTime = new Date().getTime()
	if (displayTime > 0) // && !== undefined
		setTimeout(function() {
			var tDeltaMS = new Date().getTime() - lastNotificationUpdateTime
			if (tDeltaMS >= displayTime)
				hideNotification()
		}, displayTime)
	
	d3.select("#notification").classed({"opacity0": false})
	d3.select("#notification").text(text)
}




function Move(length) {
	var self = this
	self.length = length
	self.parent
	self.line
	self.lineMainSVG
}

//Move.prototype = new Command()

Move.prototype.shallowClone = function() {
	var c = new Move(this.length)
	c.parent = this
	return c
}

Move.prototype.exec = function(f) {
	var self = this
	var x1 = f.state.x
	var y1 = f.state.y
	f.state.x += Math.sin(f.state.r) * self.length
	f.state.y -= Math.cos(f.state.r) * self.length
	var x2 = f.state.x
	var y2 = f.state.y
	if (self.line === undefined) {
		self.line = f.paintingG.append("line").style(lineStyle)
	}
	if (self.lineMainSVG === undefined && f === F_) {
		self.lineMainSVG = mainSVG.paintingG.append("line").style(lineStyle)
	}
	var lines = [self.line]
	if (f === F_)
		lines.push(self.lineMainSVG)
	for (var l in lines)
		lines[l]
			.attr("x1", x1).attr("y1", y1)
			.attr("x2", x2).attr("y2", y2)
}

Move.prototype.remove = function() {
	var self = this
	self.line.remove()
	self.line = undefined
	self.removeFromMainSVG()
}

Move.prototype.removeFromMainSVG = function() {
	var self = this
	self.lineMainSVG.remove()
	self.lineMainSVG = undefined
}



function Rotate(angle) {
	var self = this
	self.angle = angle
	self.parent
	self.savedState
	self.arc
	self.label
	self.arcMainSVG
	self.labelMainSVG
}
// TODO "Command" Prototype
Rotate.prototype.shallowClone = function() {
	var c = new Rotate(this.angle)
	c.parent = this
	return c
}

Rotate.prototype.getAngle = function() {
	var c = new Rotate(this.angle)
	c.parent = this
	return c
}

Rotate.prototype.exec = function(f) {
	var self = this
	var root = self
	while (root.parent !== undefined)
		root = root.parent
	if (self.savedState === undefined) { // clone state
		self.savedState = f.state.clone()
	}
	var dragStartState
	
	var arc = d3.svg.arc()
		.innerRadius(0)
		.outerRadius(rotationArcRadius)
		.startAngle(f.state.r)
		.endAngle(f.state.r + root.angle)
	f.state.addRadius(root.angle)
	
	if (self.arcMainSVG === undefined && f === F_) {
		self.arcMainSVG = mainSVG.paintingG.append("path").style(arcStyle)
		self.arcMainSVG.on("mouseenter", function (d, i) {
			if (!dragInProgress)
				self.arcMainSVG.style({fill: "#f00"})
		})
		self.arcMainSVG.on("mouseleave", function (d, i) {
			self.arcMainSVG.style(arcStyle)
		})
		self.arcMainSVG.on("click", function (d, i) {
			self.select()
			// to prevent click on background
			d3.event.stopPropagation()
		})
		self.arcMainSVG.call(d3.behavior.drag()
			.on("dragstart", function (d) {
				dragInProgress = true
				self.select()
				dragStartState = self.savedState.clone()
				d3.select(this).classed("dragging", true)
				// to prevent drag on background
				d3.event.sourceEvent.stopPropagation()
			})
			.on("drag", function (d) {
				var x = d3.event.x
				var y = d3.event.y
				var dx = x-dragStartState.x
				var dy = y-dragStartState.y
				var angleDelta = getAngleDeltaTo(dx, dy, dragStartState.r)
				root.angle = angleDelta
				run()
			})
			.on("dragend", function (d) {
				dragInProgress = false
				d3.select(this).classed("dragging", false)
			})
		)
	}
	if (self.arc === undefined)
		self.arc = f.paintingG.append("path").style(arcStyle)
	if (self.label === undefined)
		self.label = f.paintingG.append("text").style(textStyle)
	if (self.labelMainSVG === undefined && f === F_)
		self.labelMainSVG = mainSVG.paintingG.append("text").style(textStyle)
	
	var dir = correctRadius(f.state.r - root.angle/2)
	var x = f.state.x + Math.sin(dir) * rotationArcRadius * .6
	var y = f.state.y - Math.cos(dir) * rotationArcRadius * .6 + .5 // vertical alignment
	
	var arcs = [self.arc]
	var labels = [self.label]
	if (f === F_) {
		arcs.push(self.arcMainSVG)
		labels.push(self.labelMainSVG)
	}
	
	for (var lN in labels)
		labels[lN].text(Math.round(root.angle/Math.PI*180))
			.attr("transform", "translate("+x+","+y+")")
	for (var aN in arcs)
		arcs[aN].attr("d", arc)
			.attr("transform", "translate("+f.state.x+","+f.state.y+")")
}

Rotate.prototype.select = function() {
	selection.add(this)
	this.arcMainSVG.classed("selected", true)
}

Rotate.prototype.deselect = function() {
	this.arcMainSVG.classed("selected", false)
}

Rotate.prototype.remove = function() {
	var self = this
	self.deselect()
	self.arc.remove()
	self.arc = undefined
	self.label.remove()
	self.label = undefined
	self.removeFromMainSVG()
}

Rotate.prototype.removeFromMainSVG = function() {
	var self = this
	self.arcMainSVG.remove()
	self.arcMainSVG = undefined
	self.labelMainSVG.remove()
	self.labelMainSVG = undefined
}




function Loop(numberOfRepetitions, commands) {
	var self = this
	self.numberOfRepetitions = numberOfRepetitions
	self.commandsInsideLoop = commands
	self.parent
	// "unfolded" loop
	self.commandsAll = []
	self.savedState
	// for all repetitions
	self.iconGs = []
	self.iconGsMainSVG = []
}

Loop.prototype.shallowClone = function() {
	var c = new Loop(this.numberOfRepetitions, this.commandsInsideLoop)
	c.parent = this
	return c
}

Loop.prototype.exec = function(f) {
	var self = this
	var root = self
	var numberOfLoopParents = 0
	while (root.parent !== undefined) {
		root = root.parent
		numberOfLoopParents++
	}
	// shrink inner loops radius
	var loopClockRadiusUsed = loopClockRadius/(numberOfLoopParents+1)
	
	if (self.savedState === undefined) {
		self.savedState = f.state.clone()
	}
	
	for (var i=0; i<self.numberOfRepetitions; i++) {
		function createIcon(iconG) {
			var arc = d3.svg.arc()
				.innerRadius(0)
				.outerRadius(loopClockRadiusUsed)
				.startAngle(0)
				.endAngle(Math.PI*2/self.numberOfRepetitions*(i+1))
			iconG.append("path")
				.attr("d", arc)
				.style(clockHandStyle)

			iconG.append("circle")
				.attr("cx", 0).attr("cy", 0).attr("r", loopClockRadiusUsed)
				.style(clockStyle)

			iconG.append("text").style(textStyle)
		}
		
		if (self.iconGs.length <= i) {
			var iconG = f.paintingG.append("g")
			self.iconGs.push(iconG)
			createIcon(iconG)
		}
		if (self.iconGsMainSVG.length <= i && f === F_) {
			var iconG = mainSVG.paintingG.append("g")
			self.iconGsMainSVG.push(iconG)
			createIcon(iconG)
		}
		
		// TODO consider line-in and -out diretion for angle
		// place center away from current position in 90° angle to current heading
		var dir = correctRadius(f.state.r + Math.PI/2)
		var cx = f.state.x + Math.sin(dir) * loopClockRadius * 1.4
		var cy = f.state.y - Math.cos(dir) * loopClockRadius * 1.4
		var iconGsL = [self.iconGs[i]]
		if (f === F_)
			iconGsL.push(self.iconGsMainSVG[i])
		for (var iL in iconGsL)
			iconGsL[iL].attr("transform", "translate("+cx+","+cy+")")
		
		for (var k=0; k<self.commandsInsideLoop.length; k++) {
			var pos = i*self.commandsInsideLoop.length + k
			if (self.commandsAll.length <= pos) {
//				self.commandsInsideLoop[k].parent = self
				self.commandsAll.push(self.commandsInsideLoop[k].shallowClone())
			}
			self.commandsAll[pos].exec(f)
		}
	}
}

Loop.prototype.select = function() {
}

Loop.prototype.deselect = function() {
}

Loop.prototype.remove = function() {
	var self = this
//	self.deselect()
	for (var i=0; i<self.commandsAll.length; i++)
		self.commandsAll[i].remove()
	for (var i=0; i<self.iconGs.length; i++)
		self.iconGs[i].remove()
	self.iconGs = []
	self.removeFromMainSVG()
}

Loop.prototype.removeFromMainSVG = function() {
	var self = this
	for (var i=0; i<self.commandsAll.length; i++)
		self.commandsAll[i].removeFromMainSVG()
	for (var i=0; i<self.iconGs.length; i++)
		self.iconGsMainSVG[i].remove()
	self.iconGsMainSVG = []
}





function correctRadius(r) {
	var isPositive = r > 0
	var divIsUneven = Math.floor(Math.abs(r / Math.PI)) % 2 === 1
	// into bounds
	r = r % Math.PI
	
	// it overshot into the opposite 180°
	if (divIsUneven)
		r = (isPositive ? -1 : 1)* Math.PI + r
	console.assert(r >= -Math.PI && r <= Math.PI)
	return r
}

function openSVG() {
	var svg = document.getElementById("turtleSVG")
	window.open("data:image/svg+xml," + encodeURIComponent(
	// http://stackoverflow.com/questions/1700870/how-do-i-do-outerhtml-in-firefox
		svg.outerHTML || new XMLSerializer().serializeToString(svg)
	))
}

function updateKeyDownAndUp(keyCode, down) {
	var bodySelected = document.activeElement.nodeName === "BODY"
	switch (keyCode) {
		case keyMap.d:
			if (bodySelected) {
				if (down && !keyPressed.d) {
					drawPreviewLine()
				}
				if (!down && keyPressed.d) {
					removePreviewLine()
					F_.updateTurtle()
					mainSVG.updateTurtle()
				}
			}
			keyPressed.d = down
			break
		case keyMap.s:
			keyPressed.s = down
			if (bodySelected)
				openSVG()
			break
		case keyMap.e: keyPressed.e = down; break
		case keyMap.f: keyPressed.f = down; break
		case keyMap.g: keyPressed.g = down; break
		case keyMap["+"]: keyPressed["+"] = down; break
		case keyMap["-"]: keyPressed["-"] = down; break
		case keyMap.p: keyPressed.p = down; break
		case keyMap.del:
			if (bodySelected)
				if (down && !keyPressed.del)
					selection.removeAll()
			keyPressed.del = down
			break
		default:
//			console.log("key fell through: "+keyCode)
			break
	}
}

return ma
}()
