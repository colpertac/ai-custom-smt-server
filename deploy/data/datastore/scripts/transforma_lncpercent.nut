function define(script)
{
    script.Name = "transforma_lncPercent";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionUpdateLNC command by transforming the value to be a
// percent distance from the current value to the current target
// - params[0]: Percentage towards target (ex: 1.0 = 100%)
function transform(source, cState, dState, zone, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    if(character == null || params.len() < 1)
    {
        return -1;
    }

    // Shift both values positive to make the math simpler
    local lnc = character.GetLNC() + 10000;
    local value = action.GetValue() + 10000;

    local shift = (value - lnc) * params[0].tofloat();

    action.SetValue(character.GetLNC() + (shift > 0 ? ceil(shift) : floor(shift)));

    return 0;
}