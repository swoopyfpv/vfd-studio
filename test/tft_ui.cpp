#include <cassert>
#include <vector>
#include "../firmware/vfd_studio/tft_ui.h"

int main() {
  using namespace tft;
  assert(orient({0, 0}, true).x == Width - 1);
  assert(orient({0, 0}, true).y == Height - 1);

  // Tap each control through the same physical-to-logical transform as the driver.
  struct Case { Rect control; View view; Action action; };
  const Case cases[] = {
    {Tabs[0], View::Clock, Action::Clock}, {Tabs[1], View::Clock, Action::Scenes},
    {Tabs[2], View::Scenes, Action::Settings}, {Swatches[0], View::Settings, Action::Ion},
    {Swatches[1], View::Settings, Action::Sodium}, {Swatches[2], View::Settings, Action::Violet},
    {Turn, View::Settings, Action::Turn}, {Darker, View::Settings, Action::Darker},
    {Brighter, View::Settings, Action::Brighter},
  };
  for (const auto& c : cases) {
    Point logical{c.control.x + c.control.w / 2, c.control.y + c.control.h / 2};
    assert(hitTest(orient(logical, false), c.view) == c.action);
    Point physical{Width - 1 - logical.x, Height - 1 - logical.y};
    assert(hitTest(orient(physical, true), c.view) == c.action);
  }
  assert(hitTest({Turn.x + 4, Turn.y + 4}, View::Clock) == Action::None);

  std::vector<Color> normal(Width * Height), flipped(Width * Height);
  Appearance options;
  Frame data;
  vfd::FB scene;
  scene.clear();
  scene.box(0, 0, 10, 14);
  data.scene = &scene;
  data.title = "NEON CLOCK";

  for (int theme = 0; theme < ThemeCount; ++theme) {
    options.theme = theme;
    // Flip the entire raster for clock, project and setup-status frames.
    for (auto content : {Content::Clock, Content::Scene, Content::Status}) {
      data.content = content;
      options.flipped = false;
      draw(normal.data(), options, data);
      options.flipped = true;
      draw(flipped.data(), options, data);
      assert(std::equal(normal.begin(), normal.end(), flipped.rbegin()));
    }
    // The settings copy itself changes to show the current angle.
    data.content = Content::Settings;
    data.view = View::Settings;
    draw(flipped.data(), options, data);
    assert(flipped.back() == Themes[theme].accent);
    data.view = View::Clock;
  }
}
