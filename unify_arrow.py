import re
import numpy as np
import matplotlib.pyplot as plt
from PIL import Image, ImageDraw

INPUT_FILE = '/Users/sanchaygumber/Documents/2026 Projects/dlulu/file (1).svg'
OUTPUT_FILE = '/Users/sanchaygumber/Documents/2026 Projects/dlulu/public/logo.svg'
BRAND_COLOR = '#000000'

# High resolution for precision
SCALE = 4
WIDTH = 1024 * SCALE
HEIGHT = 1024 * SCALE

def tokenize_path(d):
    # Regex to capture commands and numbers
    return re.findall(r'[a-zA-Z]|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?', d)

def sample_cubic_bezier(p0, p1, p2, p3, steps=20):
    points = []
    for t in np.linspace(0, 1, steps):
        x = (1-t)**3*p0[0] + 3*(1-t)**2*t*p1[0] + 3*(1-t)*t**2*p2[0] + t**3*p3[0]
        y = (1-t)**3*p0[1] + 3*(1-t)**2*t*p1[1] + 3*(1-t)*t**2*p2[1] + t**3*p3[1]
        points.append((x, y))
    return points

def parse_svg_paths_basic(d_str):
    tokens = tokenize_path(d_str)
    iterator = iter(tokens)
    
    polygons = []
    current_poly = []
    current_pos = (0, 0)
    start_pos = (0, 0)
    
    try:
        while True:
            cmd = next(iterator)
            
            if cmd == 'M':
                x = float(next(iterator))
                y = float(next(iterator))
                if current_poly:
                    polygons.append(current_poly)
                current_poly = [(x, y)]
                current_pos = (x, y)
                start_pos = (x, y)
                
            elif cmd == 'L':
                x = float(next(iterator))
                y = float(next(iterator))
                current_poly.append((x, y))
                current_pos = (x, y)

            elif cmd == 'C':
                c1x = float(next(iterator))
                c1y = float(next(iterator))
                c2x = float(next(iterator))
                c2y = float(next(iterator))
                ex = float(next(iterator))
                ey = float(next(iterator))
                
                curve_points = sample_cubic_bezier(current_pos, (c1x, c1y), (c2x, c2y), (ex, ey))
                current_poly.extend(curve_points[1:])
                current_pos = (ex, ey)
                
            elif cmd.upper() == 'Z':
                current_poly.append(start_pos)
                current_pos = start_pos
                
    except StopIteration:
        if current_poly:
            polygons.append(current_poly)
            
    return polygons

def extract_paths_from_file(file_path):
    with open(file_path, 'r') as f:
        content = f.read()
        
    path_pattern = re.compile(r'<path\s+([^>]+)/>', re.DOTALL)
    attr_pattern = re.compile(r'([a-zA-Z0-9-]+)="([^"]*)"')
    
    arrows = []
    dots = []
    
    for match in path_pattern.finditer(content):
        attrs_str = match.group(1)
        attrs = dict(attr_pattern.findall(attrs_str))
        d = attrs.get('d', '')
        
        # Simple stats
        coords = [float(x) for x in re.findall(r'[-+]?\d*\.\d+|[-+]?\d+', d)]
        if not coords: continue
        xs = coords[0::2]
        ys = coords[1::2]
        if not xs: continue
        w = max(xs) - min(xs)
        h = max(ys) - min(ys)
        cx = (max(xs) + min(xs)) / 2
        cy = (max(ys) + min(ys)) / 2
        
        # Filter background
        if attrs.get('fill', '').upper() == '#13161B': continue
        if w > 900: continue
        
        # Classify
        ratio = w/h if h!=0 else 0
        is_dot = (w < 30 and h < 30 and 0.5 < ratio < 2.0)
        
        if is_dot:
            r = (w+h)/4
            dots.append((cx, cy, r))
        else:
            # Arrow fragment
            parsed_polys = parse_svg_paths_basic(d)
            arrows.extend(parsed_polys)
            
    return dots, arrows

def perpendicular_distance(point, start, end):
    if start == end:
        return np.hypot(point[0] - start[0], point[1] - start[1])
    
    # Area of triangle * 2 / base length
    # |(y2-y1)x0 - (x2-x1)y0 + x2y1 - y2x1| / distance
    # simpler: abs(cross_product) / norm
    
    x0, y0 = point
    x1, y1 = start
    x2, y2 = end
    
    num = abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1)
    den = np.hypot(x2 - x1, y2 - y1)
    
    return num / den

def ramer_douglas_peucker(points, epsilon):
    dmax = 0.0
    index = 0
    end = len(points) - 1
    
    for i in range(1, end):
        d = perpendicular_distance(points[i], points[0], points[end])
        if d > dmax:
            index = i
            dmax = d
            
    if dmax > epsilon:
        # Recursive call
        rec_results1 = ramer_douglas_peucker(points[:index+1], epsilon)
        rec_results2 = ramer_douglas_peucker(points[index:], epsilon)
        
        # Build the result list (minus the duplicate point at the separate)
        return rec_results1[:-1] + rec_results2
    else:
        return [points[0], points[end]]

def simplify_points(points, tolerance=2.0):
    # Use RDP
    # tolerance is epsilon
    # Filter very close points first to speed up
    
    # Dedup
    dedup = [points[0]]
    for p in points[1:]:
        if np.hypot(p[0]-dedup[-1][0], p[1]-dedup[-1][1]) > 0.5:
            dedup.append(p)
    if np.hypot(points[-1][0]-dedup[-1][0], points[-1][1]-dedup[-1][1]) > 0.5:
        dedup.append(points[-1])
        
    # Ensure closed loop for RDP if it's a polygon? 
    # RDP works on polyline. We treat the contour as an open line for now (start to end).
    # But for a polygon start==end usually.
    # We'll run it on the linear strip.
    
    return ramer_douglas_peucker(dedup, tolerance)

def symmetrize_arrow(points):
    # 1. Find Tip (Max X)
    # We assume 'points' is a closed loop or open strip.
    # RDP returns open strip [start...end].
    # But for a closed shape start==end usually in our contour logic?
    # Actually contour extraction returns a loop, but we might have opened it.
    # Let's clean up uniqueness.
    
    unique_points = []
    if len(points) > 0:
        unique_points.append(points[0])
        for p in points[1:]:
            if p != unique_points[-1]:
                unique_points.append(p)
    if not unique_points: return points
    
    # Find Tip
    tip_idx = max(range(len(unique_points)), key=lambda i: unique_points[i][0])
    tip = unique_points[tip_idx]
    axis_y = tip[1]
    
    # 2. Identify Top Arm
    # Rotate so tip is at 0
    rotated = unique_points[tip_idx:] + unique_points[:tip_idx]
    
    # Check orientation (Clockwise or CCW)
    # Check immediate neighbor.
    # svg coordinates: y increases downwards.
    # So "Top" means y < axis_y.
    
    # Check rotated[1].
    p_next = rotated[1] if len(rotated) > 1 else rotated[0]
    p_prev = rotated[-1]
    
    # We want the arm that goes to y < axis_y.
    top_points = []
    
    forward_is_top = (p_next[1] < axis_y)
    backward_is_top = (p_prev[1] < axis_y)
    
    # If both are top, it's weird (tip is concave?). Chevron tip is convex.
    # If neither, maybe flat?
    # Assuming one is top.
    
    if forward_is_top:
        # Traverse forward until we cross axis (y > axis_y) or hit end
        for p in rotated[1:]:
            if p[1] > axis_y + 0.1: # Tolerance
                break
            top_points.append(p)
        # The last point in top_points might be the Notch or Back-Bottom.
        # We want to stop at the "Notch" (point on axis).
        # Or if we cross, we intersect.
        
    elif backward_is_top:
        # Traverse backward
        for p in reversed(rotated[:-1]): # Start from last
            if p[1] > axis_y + 0.1:
                break
            top_points.append(p)
    else:
        # Maybe tolerance issue? Or flat?
        # Let's fallback to "keep all points with y <= axis_y" sorting by X
        # This is risky for vertical segments.
        print("Warning: Could not determine detailed connectivity. Using geometric filter.")
        candidates = [p for p in unique_points if p[1] <= axis_y + 0.5] # loose tolerance
        # Ideally sorting by X gets us valid path for a chevron?
        # Notch (low X) -> Tip (High X).
        # We want Tip -> ... -> Notch.
        # So sort descending X.
        top_points = sorted(candidates, key=lambda p: -p[0])
        # Remove tip from top_points if present (it's the pivot)
        top_points = [p for p in top_points if p != tip]

    # Clean up Top Points
    # Ensure the last point is the Notch.
    # Notch should be near axis_y.
    # If the chain drifted up, we might need to project the last point to axis.
    
    if not top_points:
        return points # Fail safe
        
    notch = top_points[-1]
    # Enforce notch on axis
    notch = (notch[0], axis_y)
    top_points[-1] = notch
    
    # 3. Construct Mirror
    # Mirror of p(x, y) is (x, axis_y + (axis_y - y)) = (x, 2*axis_y - y)
    bottom_points = []
    for p in reversed(top_points[:-1]): # Exclude notch (shared)
        mp = (p[0], 2*axis_y - p[1])
        bottom_points.append(mp)
        
    # Final Poly: Tip -> Top Points -> Bottom Points -> (Close to Tip)
    final = [tip] + top_points + bottom_points
    
    # Close loop
    final.append(tip)
    
    return final

def main():
    dots, arrow_polys = extract_paths_from_file(INPUT_FILE)
    print(f"Extracted {len(dots)} dots and {len(arrow_polys)} arrow polygons.")
    
    # 1. Rasterize Arrow
    img = Image.new('L', (WIDTH, HEIGHT), 0)
    draw = ImageDraw.Draw(img)
    
    for poly in arrow_polys:
        if len(poly) < 3: continue 
        scaled_poly = [(x*SCALE, y*SCALE) for x, y in poly]
        draw.polygon(scaled_poly, fill=255, outline=255)
        
    # 2. Find Contour
    arr = np.array(img)
    contours = plt.contour(arr, levels=[127.5])
    
    # Extract longest contour
    polys = contours.allsegs[0]
    if not polys:
        print("No contour found!")
        return
        
    main_contour = max(polys, key=lambda p: len(p))
    
    # 3. Simplify and Scale Down
    final_arrow_points = []
    for p in main_contour:
        final_arrow_points.append((p[0]/SCALE, p[1]/SCALE))
        
    final_arrow_points = simplify_points(final_arrow_points, tolerance=2.0)
    
    # --- SYMMETRY STEP ---
    # final_arrow_points = symmetrize_arrow(final_arrow_points)
    # print(f"Symmetrized points: {len(final_arrow_points)}")
    # ---------------------
    
    # 4. Generate SVG Path
    parts = []
    start = final_arrow_points[0]
    parts.append(f"M{start[0]:.2f},{start[1]:.2f}")
    
    for p in final_arrow_points[1:]:
        parts.append(f"L{p[0]:.2f},{p[1]:.2f}")
    parts.append("Z")
    
    arrow_d = " ".join(parts)
    
    # 5. Write Output
    circles_svg = []
    for cx, cy, r in dots:
        # if cx > 600: continue # Remove debris on the right (arrow side) - RESTORED
        circles_svg.append(f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r:.2f}" fill="{BRAND_COLOR}" />')
        
    svg_content = f'''<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" style="background:transparent;">
  <!-- Unified Arrow -->
  <path d="{arrow_d}" fill="{BRAND_COLOR}" />
  
  <!-- Perfect Circles -->
  {"".join(circles_svg)}
</svg>'''

    with open(OUTPUT_FILE, 'w') as f:
        f.write(svg_content)
        
    print(f"Generated {OUTPUT_FILE}")
    print(f"Arrow nodes: {len(final_arrow_points)}")

if __name__ == "__main__":
    main()
