function info = gpuSupport()
fig = uifigure(Name="gpu-support");
closeFig = onCleanup(@() delete(fig));
html = uihtml(fig, HTMLSource=fullfile(fileparts(mfilename("fullpath")), "index.html"));
html.HTMLEventReceivedFcn = @(~, event) set(fig, "UserData", event.HTMLEventData);
started = tic;
while isempty(fig.UserData) && toc(started) < 30
    pause(0.1)
end
if isempty(fig.UserData)
    error("gpuSupport:timeout", "The page did not answer within 30 seconds.")
end
info = fig.UserData;
end
