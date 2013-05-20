/*global define*/
define([
        './defaultValue',
        './DeveloperError',
        './Cartesian3',
        './Math',
        './Matrix4',
        './Ellipsoid',
        './ComponentDatatype',
        './PrimitiveType',
        './BoundingSphere',
        './GeometryAttribute',
        './GeometryIndices',
        './VertexFormat'
    ], function(
        defaultValue,
        DeveloperError,
        Cartesian3,
        CesiumMath,
        Matrix4,
        Ellipsoid,
        ComponentDatatype,
        PrimitiveType,
        BoundingSphere,
        GeometryAttribute,
        GeometryIndices,
        VertexFormat) {
    "use strict";

    var sphericalNormal = new Cartesian3();
    var normal = new Cartesian3();
    var tangent = new Cartesian3();
    var binormal = new Cartesian3();

    /**
     * Creates vertices and indices for an ellipsoid centered at the origin.
     *
     * @alias EllipsoidGeometry
     * @constructor
     *
     * @param {Ellipsoid} [options.ellipsoi=Ellipsoid.UNIT_SPHERE] The ellipsoid used to create vertex attributes.
     * @param {Number} [options.numberOfPartitions=32] The number of times to partition the ellipsoid in a plane formed by two radii in a single quadrant.
     * @param {VertexFormat} [options.vertexFormat=VertexFormat.DEFAULT] The vertex attributes to be computed.
     * @param {Matrix4} [options.modelMatrix] The model matrix for this ellipsoid.
     * @param {DOC_TBA} [options.pickData] DOC_TBA
     *
     * @exception {DeveloperError} options.numberOfPartitions must be greater than zero.
     *
     * @example
     * var ellipsoid = new EllipsoidGeometry({
     *     vertexFormat : VertexFormat.POSITION_ONLY,
     *     ellipsoid : new Ellipsoid(1000000.0, 500000.0, 500000.0),
     *     modelMatrix : Transforms.eastNorthUpToFixedFrame(center)
     * });
     */
    var EllipsoidGeometry = function(options) {
        options = defaultValue(options, defaultValue.EMPTY_OBJECT);

        var ellipsoid = defaultValue(options.ellipsoid, Ellipsoid.UNIT_SPHERE);
        var numberOfPartitions = defaultValue(options.numberOfPartitions, 32);

        var vertexFormat = defaultValue(options.vertexFormat, VertexFormat.DEFAULT);

        if (numberOfPartitions <= 0) {
            throw new DeveloperError('options.numberOfPartitions must be greater than zero.');
        }

        var positions = [];
        var indices = [];

        //
        // Initial cube.  In the plane, z = -1:
        //
        //                   +y
        //                    |
        //             Q2     * p3     Q1
        //                  / | \
        //              p0 *--+--* p2   +x
        //                  \ | /
        //             Q3     * p1     Q4
        //                    |
        //
        // Similarly, p4 to p7 are in the plane z = 1.
        //
        positions.push(new Cartesian3(-1, 0, -1));
        positions.push(new Cartesian3(0, -1, -1));
        positions.push(new Cartesian3(1, 0, -1));
        positions.push(new Cartesian3(0, 1, -1));
        positions.push(new Cartesian3(-1, 0, 1));
        positions.push(new Cartesian3(0, -1, 1));
        positions.push(new Cartesian3(1, 0, 1));
        positions.push(new Cartesian3(0, 1, 1));

        //
        // Edges
        //
        // 0 -> 1, 1 -> 2, 2 -> 3, 3 -> 0.  Plane z = -1
        // 4 -> 5, 5 -> 6, 6 -> 7, 7 -> 4.  Plane z = 1
        // 0 -> 4, 1 -> 5, 2 -> 6, 3 -> 7.  From plane z = -1 to plane z - 1
        //
        var edge0to1 = addEdgePositions(0, 1, numberOfPartitions, positions);
        var edge1to2 = addEdgePositions(1, 2, numberOfPartitions, positions);
        var edge2to3 = addEdgePositions(2, 3, numberOfPartitions, positions);
        var edge3to0 = addEdgePositions(3, 0, numberOfPartitions, positions);

        var edge4to5 = addEdgePositions(4, 5, numberOfPartitions, positions);
        var edge5to6 = addEdgePositions(5, 6, numberOfPartitions, positions);
        var edge6to7 = addEdgePositions(6, 7, numberOfPartitions, positions);
        var edge7to4 = addEdgePositions(7, 4, numberOfPartitions, positions);

        var edge0to4 = addEdgePositions(0, 4, numberOfPartitions, positions);
        var edge1to5 = addEdgePositions(1, 5, numberOfPartitions, positions);
        var edge2to6 = addEdgePositions(2, 6, numberOfPartitions, positions);
        var edge3to7 = addEdgePositions(3, 7, numberOfPartitions, positions);

        // Q3 Face
        addFaceTriangles(edge0to4, edge0to1, edge1to5, edge4to5, numberOfPartitions, positions, indices);
        // Q4 Face
        addFaceTriangles(edge1to5, edge1to2, edge2to6, edge5to6, numberOfPartitions, positions, indices);
        // Q1 Face
        addFaceTriangles(edge2to6, edge2to3, edge3to7, edge6to7, numberOfPartitions, positions, indices);
        // Q2 Face
        addFaceTriangles(edge3to7, edge3to0, edge0to4, edge7to4, numberOfPartitions, positions, indices);
        // Plane z = 1
        addFaceTriangles(edge7to4.slice(0).reverse(), edge4to5, edge5to6, edge6to7.slice(0).reverse(), numberOfPartitions, positions, indices);
        // Plane z = -1
        addFaceTriangles(edge1to2, edge0to1.slice(0).reverse(), edge3to0.slice(0).reverse(), edge2to3, numberOfPartitions, positions, indices);

        var attributes = {};

        var length = positions.length;
        var i;
        var j;

        if (vertexFormat.position) {
            // Expand cube into ellipsoid and flatten values
            var radii = ellipsoid.getRadii();
            var flattenedPositions = new Array(length * 3);

            for (i = j = 0; i < length; ++i) {
                var item = positions[i];
                Cartesian3.normalize(item, item);
                Cartesian3.multiplyComponents(item, radii, item);

                flattenedPositions[j++] = item.x;
                flattenedPositions[j++] = item.y;
                flattenedPositions[j++] = item.z;
            }

            attributes.position = new GeometryAttribute({
                componentDatatype : ComponentDatatype.FLOAT,
                componentsPerAttribute : 3,
                values : flattenedPositions
            });
        }

        if (vertexFormat.st) {
            var texCoords = new Array(length * 2);
            var oneOverRadii = ellipsoid.getOneOverRadii();

            for (i = j = 0; i < length; ++i) {
                Cartesian3.multiplyComponents(positions[i], oneOverRadii, sphericalNormal);
                Cartesian3.normalize(sphericalNormal, sphericalNormal);

                texCoords[j++] = Math.atan2(sphericalNormal.y, sphericalNormal.x) * CesiumMath.ONE_OVER_TWO_PI + 0.5;
                texCoords[j++] = Math.asin(sphericalNormal.z) * CesiumMath.ONE_OVER_PI + 0.5;
            }

            attributes.st = new GeometryAttribute({
                componentDatatype : ComponentDatatype.FLOAT,
                componentsPerAttribute : 2,
                values : texCoords
            });
        }

        if (vertexFormat.normal || vertexFormat.tangent || vertexFormat.binormal) {
            var normals = new Array(length * 3);
            var tangents = new Array(length * 3);
            var binormals = new Array(length * 3);

            for (i = j = 0; i < length; ++i, j += 3) {
                ellipsoid.geodeticSurfaceNormal(positions[i], normal);
                Cartesian3.cross(Cartesian3.UNIT_Z, normal, tangent);
                Cartesian3.cross(normal, tangent, binormal);

                normals[j] = normal.x;
                normals[j + 1] = normal.y;
                normals[j + 2] = normal.z;

                tangents[j] = tangent.x;
                tangents[j + 1] = tangent.y;
                tangents[j + 2] = tangent.z;

                binormals[j] = binormal.x;
                binormals[j + 1] = binormal.y;
                binormals[j + 2] = binormal.z;
            }

            if (vertexFormat.normal) {
                attributes.normal = new GeometryAttribute({
                    componentDatatype : ComponentDatatype.FLOAT,
                    componentsPerAttribute : 3,
                    values : normals
                });
            }

            if (vertexFormat.tangent) {
                attributes.tangent = new GeometryAttribute({
                    componentDatatype : ComponentDatatype.FLOAT,
                    componentsPerAttribute : 3,
                    values : tangents
                });
            }

            if (vertexFormat.binormal) {
                attributes.binormal = new GeometryAttribute({
                    componentDatatype : ComponentDatatype.FLOAT,
                    componentsPerAttribute : 3,
                    values : binormals
                });
            }
        }

        /**
         * An object containing {@link GeometryAttribute} properties named after each of the
         * <code>true</code> values of the {@link VertexFormat} option.
         *
         * @type Object
         */
        this.attributes = attributes;

        /**
         * An array of {@link GeometryIndices} defining primitives.
         *
         * @type Array
         */
        this.indexLists = [
            new GeometryIndices({
                primitiveType : PrimitiveType.TRIANGLES,
                values : indices
            })
        ];

        /**
         * A tight-fitting bounding sphere that encloses the vertices of the geometry.
         *
         * @type BoundingSphere
         */
        this.boundingSphere = BoundingSphere.fromEllipsoid(ellipsoid);

        /**
         * The 4x4 transformation matrix that transforms the geometry from model to world coordinates.
         * When this is the identity matrix, the geometry is drawn in world coordinates, i.e., Earth's WGS84 coordinates.
         * Local reference frames can be used by providing a different transformation matrix, like that returned
         * by {@link Transforms.eastNorthUpToFixedFrame}.
         *
         * @type Matrix4
         *
         * @see Transforms.eastNorthUpToFixedFrame
         */
        this.modelMatrix = defaultValue(options.modelMatrix, Matrix4.IDENTITY.clone());

        /**
         * DOC_TBA
         */
        this.pickData = options.pickData;
    };

    var scratchDirection = new Cartesian3();

    function addEdgePositions(i0, i1, numberOfPartitions, positions) {
        var indices = [];
        indices[0] = i0;
        indices[2 + (numberOfPartitions - 1) - 1] = i1;

        var origin = positions[i0];
        var direction = Cartesian3.subtract(positions[i1], positions[i0], scratchDirection);

        for ( var i = 1; i < numberOfPartitions; ++i) {
            var delta = i / numberOfPartitions;
            var position = Cartesian3.multiplyByScalar(direction, delta);
            Cartesian3.add(origin, position, position);

            indices[i] = positions.length;
            positions.push(position);
        }

        return indices;
    }

    var scratchX = new Cartesian3();
    var scratchY = new Cartesian3();
    var scratchOffsetX = new Cartesian3();
    var scratchOffsetY = new Cartesian3();

    function addFaceTriangles(leftBottomToTop, bottomLeftToRight, rightBottomToTop, topLeftToRight, numberOfPartitions, positions, indices) {
        var origin = positions[bottomLeftToRight[0]];
        var x = Cartesian3.subtract(positions[bottomLeftToRight[bottomLeftToRight.length - 1]], origin, scratchX);
        var y = Cartesian3.subtract(positions[topLeftToRight[0]], origin, scratchY);

        var bottomIndicesBuffer = [];
        var topIndicesBuffer = [];

        var bottomIndices = bottomLeftToRight;
        var topIndices = topIndicesBuffer;

        for ( var j = 1; j <= numberOfPartitions; ++j) {
            if (j !== numberOfPartitions) {
                if (j !== 1) {
                    //
                    // This copy could be avoided by ping ponging buffers.
                    //
                    bottomIndicesBuffer = topIndicesBuffer.slice(0);
                    bottomIndices = bottomIndicesBuffer;
                }

                topIndicesBuffer[0] = leftBottomToTop[j];
                topIndicesBuffer[numberOfPartitions] = rightBottomToTop[j];

                var deltaY = j / numberOfPartitions;
                var offsetY = Cartesian3.multiplyByScalar(y, deltaY, scratchOffsetY);

                for ( var i = 1; i < numberOfPartitions; ++i) {
                    var deltaX = i / numberOfPartitions;
                    var offsetX = Cartesian3.multiplyByScalar(x, deltaX, scratchOffsetX);
                    var position = Cartesian3.add(origin, offsetX);
                    Cartesian3.add(position, offsetY, position);

                    topIndicesBuffer[i] = positions.length;
                    positions.push(position);
                }
            } else {
                if (j !== 1) {
                    bottomIndices = topIndicesBuffer;
                }
                topIndices = topLeftToRight;
            }

            for ( var k = 0; k < numberOfPartitions; ++k) {
                indices.push(bottomIndices[k]);
                indices.push(bottomIndices[k + 1]);
                indices.push(topIndices[k + 1]);

                indices.push(bottomIndices[k]);
                indices.push(topIndices[k + 1]);
                indices.push(topIndices[k]);
            }
        }
    }

    return EllipsoidGeometry;
});