//  LauncherOSX
//
//  Created by Boris Schneiderman.
//  Copyright (c) 2012-2013 The Readium Foundation.
//
//  The Readium SDK is free software: you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version.
//
//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU General Public License for more details.
//
//  You should have received a copy of the GNU General Public License
//  along with this program.  If not, see <http://www.gnu.org/licenses/>.

/*
 * CFI navigation helper class
 *
 * @param $viewport
 * @param $iframe
 * @constructor
 */

ReadiumSDK.Views.CfiNavigationLogic = function($viewport, $iframe){

    this.getRootElement = function(){

        return $iframe[0].contentDocument.documentElement;
    };

    //we look for text and images
    this.findFirstVisibleElement = function (topOffset) {

        var $elements;
        var $firstVisibleTextNode = null;
        var percentOfElementHeight = 0;
        var originalTextNode;

        $elements = $("body", this.getRootElement()).find(":not(iframe)").contents().filter(function () {
            return isValidTextNode(this) || this.nodeName.toLowerCase() === 'img';
        });

        // Find the first visible text node
        $.each($elements, function() {

            var $element;

            if(this.nodeType === Node.TEXT_NODE)  { //text node
                $element = $(this).parent();
                originalTextNode = this;
            }
            else {
                $element = $(this); //image
                originalTextNode = undefined;
            }

            var elementRect = ReadiumSDK.Helpers.Rect.fromElement($element);

            if (elementRect.bottom() > topOffset) {
                $firstVisibleTextNode = $element;
                if(elementRect.top > topOffset) {
                    percentOfElementHeight = 0;
                }
                else {
                    percentOfElementHeight = Math.ceil(((topOffset - elementRect.top) / elementRect.height) * 100);
                }

                // Break the loop
                return false;
            }

            return true; //next element
        });

        return {$element: $firstVisibleTextNode, percentY: percentOfElementHeight, originalTextNode: originalTextNode};
    };

    this.getFirstVisibleElementCfi = function(topOffset) {
        var cfi;
        var foundElement = this.findFirstVisibleElement(topOffset);
        var $element = foundElement.$element;


        // we may get a text node or an img element here. For a text node, we can generate a complete range CFI that 
        // most specific. 
        //
        // For an img node we generate an offset CFI
        if (foundElement.originalTextNode) {
            var node = foundElement.originalTextNode;
            var startRange, endRange;
            // this is a bit of a hack. If the text node is long, part of it may be on the previous/next page and
            // won't really be visible. Instead of doing what's below, we should generate selection via 
            // http://www.w3.org/TR/cssom-view/#dom-element-getclientrects
            startRange = Math.floor(node.length * foundElement.percentY / 100);
            endRange = startRange + 1;
            cfi = EPUBcfi.Generator.generateCharOffsetRangeComponent(node, startRange, node, endRange);
        } else if ($element){
            //noinspection JSUnresolvedVariable
            var cfi = EPUBcfi.Generator.generateElementCFIComponent(foundElement.$element[0]);

            if(cfi[0] == "!") {
                cfi = cfi.substring(1);
            }

            cfi = cfi + "@0:" + foundElement.percentY;
        } else {
            console.log("Could not generate CFI no visible element on page");
        }


        return cfi;
    };

    this.getPageForElementCfi = function(cfi) {

        var cfiParts = splitCfi(cfi);

        var $element = getElementByPartialCfi(cfiParts.cfi);

        if(!$element) {
            return -1;
        }

        return this.getPageForPointOnElement($element, cfiParts.x, cfiParts.y);
    };

    function getElementByPartialCfi(cfi) {

        var contentDoc = $iframe[0].contentDocument;

        var wrappedCfi = "epubcfi(" + cfi + ")";

        try {
            //noinspection JSUnresolvedVariable
            var $element = EPUBcfi.Interpreter.getTargetElementWithPartialCFI(wrappedCfi, contentDoc);
        } catch(ex) {
            //EPUBcfi.Interpreter can throw a SyntaxError
        }

        if(!$element || $element.length == 0) {
            console.log("Can't find element for CFI: " + cfi);
            return undefined;
        }

        return $element;
    }

    this.getElementByCfi = function(cfi) {

        var cfiParts = splitCfi(cfi);
        return getElementByPartialCfi(cfiParts.cfi);
    };


    this.getPageForElement = function($element) {

        return this.getPageForPointOnElement($element, 0, 0);
    };

    this.getPageForPointOnElement = function($element, x, y) {

        var posInElement = this.getVerticalOffsetForPointOnElement($element, x, y);
        return Math.floor(posInElement / $viewport.height());
    };

    this.getVerticalOffsetForElement = function($element) {

        return this.getVerticalOffsetForPointOnElement($element, 0, 0);
    };

    this.getVerticalOffsetForPointOnElement = function($element, x, y) {

        var elementRect = ReadiumSDK.Helpers.Rect.fromElement($element);
        return Math.ceil(elementRect.top + y * elementRect.height / 100);
    };

    this.getElementBuyId = function(id) {

        var contentDoc = $iframe[0].contentDocument;

        var $element = $("#" + id, contentDoc);
        if($element.length == 0) {
            return undefined;
        }

        return $element;
    };

    this.getPageForElementId = function(id) {

        var $element = this.getElementBuyId(id);
        if(!$element) {
            return -1;
        }

        return this.getPageForElement($element);
    };

    function splitCfi(cfi) {

        var ret = {
            cfi: "",
            x: 0,
            y: 0
        };

        var ix = cfi.indexOf("@");

        if(ix != -1) {
            var terminus = cfi.substring(ix + 1);

            var colIx = terminus.indexOf(":");
            if(colIx != -1) {
                ret.x = parseInt(terminus.substr(0, colIx));
                ret.y = parseInt(terminus.substr(colIx + 1));
            }
            else {
                console.log("Unexpected terminating step format");
            }

            ret.cfi = cfi.substring(0, ix);
        }
        else {

            ret.cfi = cfi;
        }

        return ret;
    }

    this.getVisibleMediaOverlayElements = function(visibleContentOffsets) {

        var $elements = this.getElementsWithFilter($("body", this.getRootElement()),function($element){
            return $element.data("mediaOverlayData");
        });
        return this.getVisibleElements($elements, visibleContentOffsets);

    };



    this.getVisibleElementsWithFilter = function(visibleContentOffsets, filterFunction) {

        var $elements = this.getElementsWithFilter($("body", this.getRootElement()),filterFunction);
        return this.getVisibleElements($elements, visibleContentOffsets);
    };

    this.isElementVisible = function($element, visibleContentOffsets) {

        var elementRect = ReadiumSDK.Helpers.Rect.fromElement($element);

        return !(elementRect.bottom() <= visibleContentOffsets.top || elementRect.top >= visibleContentOffsets.bottom);
    };


    this.getAllVisibleElementsWithSelector = function(selector, visibleContentOffset) {
        var elements = $(selector,this.getRootElement()).filter(function(e) { return true; });
        var $newElements = [];
        $.each(elements, function() {
            $newElements.push($(this));
        });
        var visibleDivs = this.getVisibleElements($newElements, visibleContentOffset);
        return visibleDivs;

    };

    this.getVisibleElements = function($elements, visibleContentOffsets) {

        var visibleElements = [];

        // Find the first visible text node
        $.each($elements, function() {

            var elementRect = ReadiumSDK.Helpers.Rect.fromElement(this);
            // this is actually a point element, doesnt have a bounding rectangle
            if (_.isNaN(elementRect.left)) {
                var left = this.position().left;
                var top = this.position().top;
                elementRect = new ReadiumSDK.Helpers.Rect(top, left, 0, 0);
            }

            if(elementRect.bottom() <= visibleContentOffsets.top) {
                return true; //next element
            }

            if(elementRect.top >= visibleContentOffsets.bottom) {

                // Break the loop
                return false;
            }

            var visibleTop = Math.max(elementRect.top, visibleContentOffsets.top);
            var visibleBottom = Math.min(elementRect.bottom(), visibleContentOffsets.bottom);

            var visibleHeight = visibleBottom - visibleTop;
            var percentVisible = Math.round((visibleHeight / elementRect.height) * 100);

            visibleElements.push({element: this[0], percentVisible: percentVisible});

            return true;

        });

        return visibleElements;
    };

    this.getVisibleTextElements = function(visibleContentOffsets) {

        var $elements = this.getTextElements($("body", this.getRootElement()));

        return this.getVisibleElements($elements, visibleContentOffsets);
    };

    this.getElementsWithFilter = function($root,filterFunction) {

        var $elements = [];

        function traverseCollection(elements) {

            if (elements == undefined) return;

            for(var i = 0, count = elements.length; i < count; i++) {

                var $element = $(elements[i]);

                if(filterFunction($element)) {
                    $elements.push($element);
                }
                else {
                    traverseCollection($element[0].children);
                }

            }
        }
        traverseCollection([$root[0]]);

        return $elements;
    };

    this.getTextElements = function($root) {

        var $textElements = [];

        $root.find(":not(iframe)").contents().each(function () {

            if( isValidTextNode(this) ) {
                $textElements.push($(this).parent());
            }

        });

        return $textElements;

    };

    function isValidTextNode(node) {

        if(node.nodeType === Node.TEXT_NODE) {

            // Heuristic to find a text node with actual text
            // If we don't do this, we may get a reference to a node that doesn't get rendered
            // (such as for example a node that has tab character and a bunch of spaces) 
            // this is would be bad! ask me why.
            var nodeText = node.nodeValue.replace(/[\s\n\r\t]/g, "");
            return nodeText.length > 0;
        }

        return false;

    }

    this.getElements = function(selector){
        if (!selector) {
            return $(this.getRootElement()).children();
        }
        return $(selector, this.getRootElement());
    }

    this.getElement = function(selector) {

        var $element = this.getElements(selector);

        if($element.length > 0) {
            return $element[0];
        }

        return 0;
    };



};
