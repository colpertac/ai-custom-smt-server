function define(script)
{
    script.Name = "transforme_counterValue";
    script.Type = "EventTransform";
    return 0;
}

// Set an EventExNPCMessage message value based on an EventCounter value
// - params[0]: Event counter type
function transform(source, cState, dState, zone, params)
{
    if(params.len() == 0 || cState == null)
    {
        return -1;
    }

    local counter = cState.GetEventCounter(params[0].tointeger(), false);

    if(counter != null)
    {
        event.SetMessageValue(counter.GetCounter());
    }
    else
    {
        event.SetMessageValue(0);
    }

    return 0;
}