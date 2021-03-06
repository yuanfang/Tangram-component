/*
 * Tangram
 * Copyright 2011 Baidu Inc. All rights reserved.
 */

///import baidu.ui.createUI;
///import baidu.lang.guid;
///import baidu.browser.ie;
///import baidu.dom.insertHTML;
///import baidu.string.format;
///import baidu.array.each;
///import baidu.array.indexOf;
///import baidu.array.find;
///import baidu.dom.g;
///import baidu.dom.remove;
///import baidu.dom.children;
///import baidu.dom.getStyle;
///import baidu.dom.create;
///import baidu.dom.addClass;
///import baidu.dom.removeClass;
///import baidu.event.on;
///import baidu.event.un;
///import baidu.fn.bind;
///import baidu.object.each;

/**
 * 创建一个简单的滚动组件
 * @param {Object} options config参数.
 * @config {String} orientation 描述该组件是创建一个横向滚动组件或是竖向滚动组件，取值：horizontal:横向, vertical:竖向
 * @config {Object} contentText 定义carousel组件每一项的字符数据，格式：[{content: 'text-0'}, {content: 'text-1'}, {content: 'text-2'}...]
 * @config {String} flip 定义组件的翻页方式，取值：item:一次滚动一个项, page:一次滚动一页
 * @config {Number} pageSize 描述一页显示多少个滚动项，默认值是3
 * @config {String} onload 当渲染完组件时触发该事件
 * @config {String} onbeforescroll 当开始滚动时触发该事件
 * @config {String} onafterscroll 当结束一次滚动时触发该事件
 * @config {String} onprev 当翻到前一项或前一页时触发该事件
 * @config {String} onnext 当翻到下一项或下一页时触发该事件
 * @author linlingyu
 */
baidu.ui.Carousel = baidu.ui.createUI(function(options) {
    var me = this,
        data = me.contentText || [];
    me._datas = data.slice(0, data.length);
    me._itemIds = [];
    me._items = {};//用来存入被删除的节点，当再次被使用时可以直接拿回来,格式:{element: dom, handler: []}
    baidu.array.each(me._datas, function(item) {
        me._itemIds.push(baidu.lang.guid());
    });
    me.flip = me.flip.toLowerCase();
    me.orientation = me.orientation.toLowerCase();
}).extend(
    /**
     *  @lends baidu.ui.Carousel.prototype
     */
{
    uiType: 'carousel',
    orientation: 'horizontal',//horizontal|vertical
    //direction: 'down',//up|right|down|left
    flip: 'item',//item|page
    pageSize: 3,
    scrollIndex: 0,
    offsetWidth: 0,//这个属性是为了在老版本中支持margin，现版本中不再开放给用户
    offsetHeight: 0,//这个属性是为了在老版本中支持margin，现版本中不再开放给用户
    _axis: {
        horizontal: {pos: 'left', size: 'width', offset: 'offsetWidth', client: 'clientWidth', scrollPos: 'scrollLeft'},
        vertical: {pos: 'top', size: 'height', offset: 'offsetHeight', client: 'clientHeight', scrollPos: 'scrollTop'}
    },
    tplDOM: '<div id="#{id}" class="#{class}">#{content}</div>',
    /**
     * 生成一个容器的字符串
     * @return {String}
     * @private
     */
    getString: function() {
        var me = this,
            str = baidu.string.format(me.tplDOM, {
                id: me.getId('scroll'),
                'class': me.getClass('scroll')
            });
        return baidu.string.format(me.tplDOM, {
            id: me.getId(),
            'class': me.getClass(),
            content: str
        });
    },
    /**
     * 渲染滚动组件到参数指定的容器中
     * @param {HTMLElement} target 一个用来存放组件的容器对象.
     */
    render: function(target) {
        var me = this;
        if (!target || me.getMain()) {return;}
        baidu.dom.insertHTML(me.renderMain(target), 'beforeEnd', me.getString());
        me._renderItems();
        me._resizeView();
        me._moveCenter();
        me.focus(me.scrollIndex);
        me.addEventListener('onafterscroll', function(evt) {
            var orie = me.orientation == 'horizontal',
                axis = me._axis[me.orientation],
                sContainer = me.getScrollContainer();
            me._renderItems(evt.index, evt.scrollOffset);
            sContainer.style[axis.size] = parseInt(sContainer.style[axis.size])
                - me['_bound' + (orie ? 'X' : 'Y')].offset
                * evt.scrollUnit + 'px';
            me._moveCenter();
        });
        me.dispatchEvent('onload');
    },
    /**
     * 从缓存中取出滚动项按照参数的格式在页面上排列出滚动项
     * @param {Number} index 索引值.
     * @param {Number} offset 指定索引项放在页面的位置.
     * @private
     */
    _renderItems: function(index, offset) {
        var me = this,
            sContainer = me.getScrollContainer(),
            index = Math.min(Math.max(index | 0, 0), me._datas.length - 1),
            offset = Math.min(Math.max(offset | 0, 0), me.pageSize - 1),
            sContainer = me.getScrollContainer(),
            count = me.pageSize,
            i = 0,
            itemIndex;
        while (sContainer.firstChild) {//这里改用innerHTML赋空值会使js存的dom也被清空
            baidu.dom.remove(sContainer.firstChild);
        }
        for (; i < count; i++) {
            sContainer.appendChild(me._getItemElement(index - offset + i));
        }
    },
    /**
     * 将滚动容器排列到中间位置
     * @private
     */
    _moveCenter: function() {
        if (!this._boundX) {return;}
        var me = this,
            axis = me._axis[me.orientation];
        me.getBody()[axis.scrollPos] = me.orientation == 'horizontal'
            && baidu.browser.ie == 6 ? me._boundX.marginX : 0;
    },
    /**
     * 运算可视区域的宽高(包括对margin的运算)，并运算出一个滚动单位的offsetWidth和offsetHeight
     * @private
     */
    _resizeView: function() {
        if (this._datas.length <= 0) {return;}//没有数据
        var me = this,
            axis = me._axis[me.orientation],
            orie = me.orientation == 'horizontal',
            sContainer = me.getScrollContainer(),
            child = baidu.dom.children(sContainer),
            bound,
            boundX,
            boundY;
        function getItemBound(item, type) {
            var type = type == 'x',
                bound = item[type ? 'offsetWidth' : 'offsetHeight'],
                marginX = parseInt(baidu.dom.getStyle(item, type ? 'marginLeft' : 'marginTop')),
                marginY = parseInt(baidu.dom.getStyle(item, type ? 'marginRight' : 'marginBottom'));
            isNaN(marginX) && (marginX = 0);
            isNaN(marginY) && (marginY = 0);
            return {
//                size: bound,
                offset: bound + (orie ? marginX + marginY : Math.max(marginX, marginY)),
                marginX: marginX,
                marginY: marginY
            };
        }
        me._boundX = boundX = getItemBound(child[0], 'x');
        me._boundY = boundY = getItemBound(child[0], 'y');
        bound = orie ? boundX : boundY;
        me.offsetWidth <= 0 && (me.offsetWidth = boundX.offset);
        me.offsetHeight <= 0 && (me.offsetHeight = boundY.offset);
        sContainer.style.width = boundX.offset
            * (orie ? child.length : 1)
            + (baidu.browser.ie == 6 ? boundX.marginX : 0)
            + 'px';
        sContainer.style.height = boundY.offset
            * (orie ? 1 : child.length)
            + (orie ? 0 : boundY.marginX)
            + 'px';
        me.getBody().style[axis.size] = bound.offset * me.pageSize
            + (orie ? 0 : Math.min(bound.marginX, bound.marginY)) + 'px';
    },
    /**
     * 根据索引的从缓存中取出对应的滚动项，如果缓存不存在该项则创建并存入缓存，空滚动项不被存入缓存
     * @param {Number} index 索引值.
     * @return {HTMLElement}
     * @private
     */
    _baseItemElement: function(index) {
        var me = this,
            itemId = me._itemIds[index],
            entry = me._items[itemId] || {},
            txt = me._datas[index],
            element;
        if (!entry.element) {
            entry.element = element = baidu.dom.create('div', {
                id: itemId || '',
                'class': me.getClass('item')
            });
            !itemId && baidu.dom.addClass(element, me.getClass('item-empty'));
            element.innerHTML = txt ? txt.content : '';
            if (itemId) {
                entry.handler = [
                    {evtName: 'click', handler: baidu.fn.bind('_onItemClickHandler', me, element)},
                    {evtName: 'mouseover', handler: baidu.fn.bind('_onMouseHandler', me, 'mouseover')},
                    {evtName: 'mouseout', handler: baidu.fn.bind('_onMouseHandler', me, 'mouseout')}
                ];
                baidu.array.each(entry.handler, function(item) {
                    baidu.event.on(element, item.evtName, item.handler);
                });
                me._items[itemId] = entry;
            }
        }
        return entry.element;
    },
    /**
     * 对_baseItemElement的再包装，在循环滚动中可以被重写
     * @param {Number} index 索引值.
     * @return {HTMLElement}
     */
    _getItemElement: function(index) {
        return this._baseItemElement(index);
    },
    /**
     * 处理点击滚动项的事件触发
     * @param {HTMLElement} ele 该滚动项的容器对象.
     * @param {Event} evt 触发事件的对象.
     * @private
     */
    _onItemClickHandler: function(ele, evt) {
        var me = this;
        me.focus(baidu.array.indexOf(me._itemIds, ele.id));
        me.dispatchEvent('onitemclick');
    },
    /**
     * 处理鼠标在滚动项上划过的事件触发
     * @param {String} type mouseover或是omouseout.
     * @param {Event} evt 触发事件的对象.
     * @private
     */
    _onMouseHandler: function(type, evt) {
        this.dispatchEvent('on' + type);
    },
    /**
     * 取得当前得到焦点项在所有数据项中的索引值
     * @return {Number} 索引值.
     */
    getCurrentIndex: function() {
        return this.scrollIndex;
    },
    /**
     * 取得数据项的总数目
     * @return {Number} 总数.
     */
    getTotalCount: function() {
        return this._datas.length;
    },
    /**
     * 根据数据的索引值取得对应在页面的DOM节点，当节点不存时返回null
     * @param {Number} index 在数据中的索引值.
     * @return {HTMLElement} 返回一个DOM节点.
     */
    getItem: function(index) {
        return baidu.dom.g(this._itemIds[index]);
    },
    /**
     * 从当前项滚动到index指定的项，并将该项放在scrollOffset的位置
     * @param {Number} index 在滚动数据中的索引.
     * @param {Number} scrollOffset 在页面的显示位置.
     * @param {String} direction 滚动方向，取值: prev:强制滚动到上一步, next:强制滚动到下一步，当不给出该值时，会自动运算一个方向来滚动.
     */
    scrollTo: function(index, scrollOffset, direction) {
        var me = this,
            axis = me._axis[me.orientation],
            scrollOffset = Math.min(Math.max(scrollOffset, 0), me.pageSize - 1),
            sContainer = me.getScrollContainer(),
            child = baidu.dom.children(sContainer),
            item = me.getItem(index),
            smartDirection = direction,
            distance = baidu.array.indexOf(child, item) - scrollOffset,
            count = Math.abs(distance),
            len = me._datas.length,
            i = 0,
            fragment,
            vergeIndex,
            is;
        if ((item && distance == 0 && !direction)
            || me._datas.length <= 0 || index < 0
            || index > me._datas.length - 1) {return;}
        if (!smartDirection) {//自动运算合理的方向
            smartDirection = item ? (distance < 0 ? 'prev' : (distance > 0 ? 'next' : 'keep'))
                : baidu.array.indexOf(me._itemIds,
                    baidu.array.find(child, function(ele) {return !!ele.id}))
                    > index ? 'prev' : 'next';
        }
        is = smartDirection == 'prev';
        if (!item || direction) {
            vergeIndex = baidu.array.indexOf(me._itemIds,
                child[is ? 0 : child.length - 1].id);
            //(x + len - y) % len
            //Math(offset - (is ? 0 : pz - 1)) + count
            count = Math.abs(scrollOffset - (is ? 0 : me.pageSize - 1))
                + ((is ? vergeIndex : index) + len - (is ? index : vergeIndex)) % len;
            count > me.pageSize && (count = me.pageSize);
        }
        fragment = count > 0 && document.createDocumentFragment();
        for (; i < count; i++) {
            fragment.appendChild(
                me._getItemElement(is ? index - scrollOffset + i
                    : me.pageSize + index + i
                        - (item && !direction ? baidu.array.indexOf(child, item) : scrollOffset + count))
            );
        }
        is ? sContainer.insertBefore(fragment, child[0])
            : sContainer.appendChild(fragment);
        distance = me['_bound' + (me.orientation == 'horizontal' ? 'X' : 'Y')].offset * count;
        sContainer.style[axis.size] = parseInt(sContainer.style[axis.size]) + distance + 'px';
        is && (me.getBody()[axis.scrollPos] += distance);
        if (me.dispatchEvent('onbeforescroll',
            {index: index, scrollOffset: scrollOffset, direction: smartDirection,
				scrollUnit: count})) {
            me.getBody()[axis.scrollPos] += count * me[axis.offset] * (is ? -1 : 1);
            me.dispatchEvent('onafterscroll',
                {index: index, scrollOffset: scrollOffset, direction: smartDirection, scrollUnit: count});
        }
    },
    /**
     * 取得翻页的索引和索引在页面中的位置
     * @param {String} type 翻页方向，取值：prev:翻到上一步,next:翻到下一步.
     * @return {Object} {index:需要到达的索引项, scrollOffset:在页面中的位置}.
     * @private
     */
    _getFlipIndex: function(type) {
        var me = this,
            is = me.flip == 'item',
            type = type == 'prev',
            currIndex = me.scrollIndex,
            index = currIndex + (is ? 1 : me.pageSize) * (type ? -1 : 1),
            offset = is ? (type ? 0 : me.pageSize - 1)
                : baidu.array.indexOf(baidu.dom.children(me.getScrollContainer()), me.getItem(currIndex)),
            flipIndex;
        if (!is && (index < 0 || index > me._datas.length - 1)) {
            index = currIndex - offset + (type ? -1 : me.pageSize);
            offset = type ? me.pageSize - 1 : 0;
        }
        return {index: index, scrollOffset: offset};
    },
    /**
     * 翻面的基础处理方法
     * @param {String} type 翻页方向，取值：prev:翻到上一步,next:翻到下一步.
     * @private
     */
    _baseFlip: function(type) {
        if (!this.getItem(this.scrollIndex)) {return;}
        var me = this,
            sContainer = me.getScrollContainer(),
            flip = me._getFlipIndex(type);
        function scrollTo(index, offset, type) {
            me.addEventListener('onafterscroll', function(evt) {
                var target = evt.target;
                target.focus(evt.index);
                target.removeEventListener('onafterscroll', arguments.callee);
            });
            me.scrollTo(index, offset, type);
        }
        if (me.flip == 'item') {
            me.getItem(flip.index) ? me.focus(flip.index)
                : scrollTo(flip.index, flip.scrollOffset, type);
        }else {
            me._getItemElement(flip.index).id
                && scrollTo(flip.index, flip.scrollOffset, type);
        }
    },
    /**
     * 翻到上一项或是翻到上一页
     */
    prev: function() {
        this._baseFlip('prev');
    },
    /**
     * 翻到下一项或是翻到下一页
     */
    next: function() {
        this._baseFlip('next');
    },
    /**
     * 是否已经处在第一项或第一页
     * @return {Boolean} true:当前已是到第一项或第一页.
     */
    isFirst: function() {
        var flip = this._getFlipIndex('prev');
        return flip.index < 0;
    },
    /**
     * 是否已经处在末项或是末页
     * @return {Boolean} true:当前已是到末项或末页.
     */
    isLast: function() {
        var flip = this._getFlipIndex('next');
        return flip.index >= this._datas.length;
    },
    /**
     * 使当前选中的项失去焦点
     * @private
     */
    _blur: function() {
        var me = this,
            itemId = me._itemIds[me.scrollIndex];
        if (itemId) {
            baidu.dom.removeClass(me._baseItemElement(me.scrollIndex),
                me.getClass('item-focus'));
            me.scrollIndex = -1;
        }
    },
    /**
     * 使某一项得到焦点
     * @param {Number} index 需要得到焦点项的索引.
     */
    focus: function(index) {
        var me = this,
            itemId = me._itemIds[index],
            item = itemId && me._baseItemElement(index);//防止浪费资源创出空的element
        if (itemId) {
            me._blur();
            baidu.dom.addClass(item, me.getClass('item-focus'));
            me.scrollIndex = index;
        }
    },
    /**
     * 取得存放所有项的上层容器
     * @return {HTMLElement} 一个HTML元素.
     */
    getScrollContainer: function() {
        return baidu.dom.g(this.getId('scroll'));
    },
    /**
     * 析构函数
     */
    dispose: function() {
        var me = this;
        me.dispatchEvent('ondispose');
        baidu.object.each(me._items, function(item) {
            item.handler && baidu.array.each(item.handler, function(listener) {
                baidu.event.un(item.element, listener.evtName, listener.handler);
            });
        });
        baidu.dom.remove(me.getMain());
        baidu.lang.Class.prototype.dispose.call(me);
    }
});
