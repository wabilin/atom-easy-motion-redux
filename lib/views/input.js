"use babel";

/* eslint-disable no-loop-func, no-bitwise, no-continue */

import { View, TextEditorView } from "atom-space-pen-views";
import { CompositeDisposable } from "atom";
import _ from "underscore-plus";
import Markers from "./markers";

class InputView extends View {
    static content() {
        return this.div( {
            "class": "easy-motion-redux-input"
        }, () => {
            this.div( {
                "class": "editor-container",
                "outlet": "editorContainer"
            } );
            return this.subview( "editorInput", new TextEditorView( {
                "mini": true,
                "placeholderText": "EasyMotion"
            } ) );
        } );
    }

    constructor( oRefTextEditor, sMode, bSelect ) {
        super( oRefTextEditor, sMode, bSelect );
    }

    initialize( oRefTextEditor, sMode, bSelect ) {
        this.sMode = sMode;
        this.bSelect = bSelect;
        this.aPositions = [];
        this.sLetter = null;
        this.oRefTextEditor = oRefTextEditor;

        this.updatePlaceholder();

        this.subscriptions = new CompositeDisposable();

        this.oRefTextEditorView = atom.views.getView( this.oRefTextEditor );
        this.markers = new Markers( this.oRefTextEditor, this.oRefTextEditorView );

        this.oRefTextEditorView.classList.add( "easy-motion-redux-editor" );
        this.scrollToCorrectPosition();

        this.handleEvents();
    }

    updatePlaceholder() {
        let sPlaceholderText;

        switch ( this.sMode ) {
            case InputView.MODE_LETTER:
                sPlaceholderText = "EasyMotion:Letter";
                break;
            case InputView.MODE_WORDS_STARTING:
                sPlaceholderText = "EasyMotion:Words starting with letter";
                break;
            case InputView.MODE_WORDS:
                sPlaceholderText = "EasyMotion:Words";
                break;
            case InputView.MODE_LINES:
            default:
                sPlaceholderText = "EasyMotion:Lines";
                break;
        }
        this.editorInput.element.getModel().setPlaceholderText( sPlaceholderText );
    }

    handleEvents() {
        this.editorInput.element.addEventListener( "keypress", this.autosubmit.bind( this ) );
        this.editorInput.element.addEventListener( "blur", this.remove.bind( this ) );
        this.subscriptions.add( atom.commands.add( this.editorInput.element, {
            "core:backspace": this.backspace.bind( this ),
            "core:confirm": () => {
                this.confirm();
            },
            "core:cancel": () => {
                this.goBack();
            },
            "core:page-up": () => {
                this.oRefTextEditor.trigger( "core:page-up" );
            },
            "core:page-down": () => {
                this.oRefTextEditor.trigger( "core:page-down" );
            }
        } ) );

        const goBack = this.goBack.bind( this );

        this.subscriptions.add(
            this.oRefTextEditor.element.onDidChangeScrollTop( goBack ) );
    }

    resetPositions() {
        this.markers.clear();
        if ( !this.inMode( InputView.MODE_LETTER, InputView.MODE_WORDS_STARTING ) ) {
            this.loadPositions();
            this.groupPositions();
        }
    }

    hasPositions() {
        switch ( this.sMode ) {
            case InputView.MODE_LETTER:
            case InputView.MODE_WORDS_STARTING:
                return this.sLetter ? this.aPositions.length > 0 : true;
            case InputView.MODE_WORDS:
            case InputView.MODE_LINES:
            default:
                return this.aPositions.length > 0;
        }
    }

    autosubmit( oEvent ) {
        let sChar = String.fromCharCode( oEvent.charCode );

        if ( !this.sLetter && this.inMode( InputView.MODE_LETTER, InputView.MODE_WORDS_STARTING ) ) {
            this.sLetter = sChar;
            this.loadPositions();
            this.groupPositions();
            return false;
        }

        this.filterPositions( sChar );
        return false;
    }

    backspace() {
        if ( this.editorInput.getText().length === 0 ) {
            this.goBack();
            return;
        }

        if ( this.inMode( InputView.MODE_LETTER, InputView.MODE_WORDS_STARTING ) ) {
            if ( this.editorInput.getText().length === 1 ) {
                this.sLetter = null;
                this.loadPositions();
                this.groupPositions();
            } else {
                this.loadPositions();
                this.groupPositions();
                return;
            }
        }

        this.resetPositions();
    }

    remove() {
        this.subscriptions.dispose();
        this.markers.clear();
        this.oRefTextEditorView.classList.remove( "easy-motion-redux-editor" );
        super.remove();
    }

    confirm() {
        let point = this.aPositions[ 0 ][ 0 ];

        if ( this.bSelect ) {
            point.column += 1; // include target letter in selection
            this.oRefTextEditor.selectToBufferPosition( point );
        } else {
            this.oRefTextEditor.setCursorBufferPosition( point );
        }
        this.goBack();
    }

    goBack() {
        this.oRefTextEditorView.focus();
        this.remove();
        this.panel.destroy();
    }

    focus() {
        this.editorInput.focus();
    }

    filterPositions( sChar ) {
        this.pickPositions( sChar );
        const { length } = this.aPositions;

        if ( length === 0 ) {
            this.goBack();
        } else if ( length > 1 ) {
            this.groupPositions();
        } else {
            this.confirm();
        }
    }

    groupPositions() {
        let iCount = this.aPositions.length,
            sReplaceCharacters = atom.config.get( "easy-motion-redux.replaceCharacters" ),
            iLast = 0;

        this.oGroupedPositions = {};

        for ( let i of _.range( 0, sReplaceCharacters.length ) ) {
            let iTake = Math.floor( iCount / sReplaceCharacters.length );

            if ( i < iCount % sReplaceCharacters.length ) {
                iTake += 1;
            }

            this.oGroupedPositions[ sReplaceCharacters[ i ] ] = [];
            this.aPositions.slice( iLast, iLast + iTake ).forEach( ( oWordStart, j ) => {
                let sReplacement,
                    bSingle = iTake === 1;

                if ( bSingle ) {
                    sReplacement = sReplaceCharacters[ i ];
                } else {
                    let iCharsAmount = sReplaceCharacters.length,
                        iRemains = iTake % iCharsAmount,
                        k;

                    if ( iTake <= iCharsAmount ) {
                        k = j % iTake;
                    } else if ( iTake < 2 * iCharsAmount && j >= iRemains * 2 ) {
                        k = j - iRemains;
                    } else {
                        k = -1;
                    }

                    sReplacement = sReplaceCharacters[ i ] + ( sReplaceCharacters[ k ] || "•" );
                }

                this.oGroupedPositions[ sReplaceCharacters[ i ] ].push( oWordStart );
                this.markers.add( oWordStart, sReplacement, {
                    "single": bSingle
                } );
            } );

            iLast += iTake;
        }
    }

    pickPositions( sChar ) {
        let sCharacter = sChar;

        this.markers.clear();
        if ( sCharacter in this.oGroupedPositions && this.oGroupedPositions[ sCharacter ].length ) {
            this.aPositions = this.oGroupedPositions[ sCharacter ];
            return;
        }

        if ( sCharacter !== sCharacter.toLowerCase() ) {
            sCharacter = sCharacter.toLowerCase();
        } else if ( sCharacter !== sCharacter.toUpperCase() ) {
            sCharacter = sCharacter.toUpperCase();
        } else {
            return;
        }

        if ( sCharacter in this.oGroupedPositions && this.oGroupedPositions[ sCharacter ].length ) {
            this.aPositions = this.oGroupedPositions[ sCharacter ];
        }
    }

    createLetterRegExp( sLetter ) {
        const sSearch = ( sLetter || "" ).replace( /([\W]+)/g, "\\$1" );

        return new RegExp( sSearch, "gi" );
    }

    loadPositions() {
        let oBuffer = this.oRefTextEditor.getBuffer(),
            aPositions = [],
            fMarkBeginning,
            rPositionRegExp;

        fMarkBeginning = ( oObj ) => {
            let [ iStart, iEnd ] = [ null, null ];

            iStart = oObj.range.start;
            if ( this.sMode === InputView.MODE_WORDS_STARTING ) {
                iStart.column = oObj.range.end.column - 1;
            }
            iEnd = [ iStart.row, iStart.column + 1 ];

            aPositions.push( [ iStart, iEnd ] );
        };

        switch ( this.sMode ) {
            case InputView.MODE_LETTER:
                rPositionRegExp = this.createLetterRegExp( this.sLetter );
                break;
            case InputView.MODE_WORDS_STARTING:
                rPositionRegExp = this.startingLetterWordRegExp( this.sLetter );
                break;
            case InputView.MODE_WORDS:
                rPositionRegExp = this.wordRegExp();
                break;
            case InputView.MODE_LINES:
            default:
                break;
        }

        if ( this.sMode === InputView.MODE_LINES ) {
            aPositions = this.lineBeginngPositions();
        } else {
            for ( let oRowRange of this.getRowRanges() ) {
                oBuffer.scanInRange( rPositionRegExp, oRowRange, fMarkBeginning );
            }
        }

        this.aPositions = aPositions;
    }

    getValidRows() {
        const isInputAppearsBeforeThis = this.sMode === InputView.MODE_WORDS_STARTING || this.sMode === InputView.MODE_LETTER,
            getLastVisibleScreenRow = this.oRefTextEditorView.getLastVisibleScreenRow(),
            iBeginRow = this.oRefTextEditorView.getFirstVisibleScreenRow(),
            iEndRow = isInputAppearsBeforeThis ? getLastVisibleScreenRow : getLastVisibleScreenRow - this.getRowPadding(),
            aResultingRows = [];

        for ( let iRow of _.range( iBeginRow, iEndRow ) ) {
            if ( this.notFolded( iRow ) ) {
                aResultingRows.push( iRow );
            }
        }

        return aResultingRows;
    }

    getRowRanges() {
        const aRows = this.getValidRows();

        return aRows.map( ( iRow ) => {
            return this.getColumnRangeForRow( iRow );
        } );
    }

    getColumnRangeForRow( iRow ) {
        let oBuffer = this.oRefTextEditor.getBuffer(),
            iBeginColumn,
            iEndColumn,
            oRange;

        if ( oBuffer.isRowBlank( iRow ) ) {
            return [ [ iRow, 0 ], [ iRow, 0 ] ];
        }

        if ( this.oRefTextEditor.isSoftWrapped() ) {
            oRange = oBuffer.rangeForRow( iRow );
            iBeginColumn = oRange.start.column;
            iEndColumn = oRange.end.column;
        } else {
            oRange = oBuffer.rangeForRow( iRow );
            let iMaxColumn = this.oRefTextEditor.getEditorWidthInChars(),
                iCharWidth = this.oRefTextEditor.getDefaultCharWidth(),
                iLeft = this.oRefTextEditor.element.getScrollLeft();

            if ( iLeft === 0 ) {
                iBeginColumn = 0;
                iEndColumn = iMaxColumn;
            } else {
                iBeginColumn = Math.floor( iLeft / iCharWidth );
                iEndColumn = iBeginColumn + iMaxColumn;
            }
        }

        return [ [ iRow, iBeginColumn ], [ iRow, iEndColumn ] ];
    }

    getRowPadding() {
        let height = this.outerHeight(),
            pixelsPerLine = this.oRefTextEditor.getLineHeightInPixels();

        return Math.floor( height / pixelsPerLine );
    }

    notFolded( iRow ) {
        return iRow === 0 || !this.oRefTextEditor.isFoldedAtBufferRow( iRow ) || !this.oRefTextEditor.isFoldedAtBufferRow( iRow - 1 );
    }

    wordRegExp() {
        let sNonWordCharacters = atom.config.get( "editor.nonWordCharacters" );

        return new RegExp( `[^\\s${ _.escapeRegExp( sNonWordCharacters ) }]+`, "gi" );
    }

    startingLetterWordRegExp( sStartingLetter ) {
        let sNonWordCharacters = atom.config.get( "editor.nonWordCharacters" );

        return new RegExp( `(?:^${ sStartingLetter }|[\\s${ _.escapeRegExp( sNonWordCharacters ) }]+${ sStartingLetter })`, "gi" );
    }

    lineBeginngPositions() {
        const aRows = this.getValidRows();

        return aRows.map( ( row ) => [ [ row, 0 ], [ row, 0 ] ] );
    }

    scrollToCorrectPosition() {
        if ( this.sMode === InputView.MODE_LINES ) {
            const { row } = this.oRefTextEditor.getCursorBufferPosition();

            this.oRefTextEditor.scrollToScreenPosition( [ row, 0 ] );
        }
    }

    inMode( ...modes ) {
        return modes.includes( this.sMode );
    }
}

InputView.MODE_WORDS = "words";
InputView.MODE_LETTER = "letter";
InputView.MODE_WORDS_STARTING = "words_starting";
InputView.MODE_LINES = "lines";

export default InputView;
